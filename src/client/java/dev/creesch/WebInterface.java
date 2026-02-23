package dev.creesch;

import com.google.gson.Gson;
import dev.creesch.config.ModConfig;
import dev.creesch.model.IncomingWebsocketJsonMessage;
import dev.creesch.model.IncomingWebsocketJsonMessage.HistoryPayload;
import dev.creesch.model.WebsocketJsonMessage;
import dev.creesch.model.WebsocketMessageBuilder;
import dev.creesch.storage.ChatMessageRepository;
import dev.creesch.util.NamedLogger;
import io.javalin.Javalin;
import io.javalin.http.staticfiles.Location;
import io.javalin.websocket.WsContext;
import io.javalin.websocket.WsMessageContext;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;
import lombok.Getter;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ClientPlayerEntity;

public class WebInterface {

    // Server related things
    @Getter
    private final Javalin server;

    private final Gson gson = new Gson();
    private final Set<WsContext> connections = Collections.newSetFromMap(
        new ConcurrentHashMap<>()
    );

    private static final NamedLogger LOGGER = new NamedLogger("web-chat");
    private static final ModConfig config = ModConfig.HANDLER.instance();
    private final ChatMessageRepository messageRepository;
    private static final Pattern ILLEGAL_CHARACTERS = Pattern.compile(
        "[\\n\\r§\u00A7\\u0000-\\u001F\\u200B-\\u200F\\u2028-\\u202F]"
    );
    private static final Pattern MULTIPLE_SPACES = Pattern.compile("\\s{2,}");
    private static final Pattern SUPPORTED_COMMANDS = Pattern.compile(
        "^/(msg|tell|w|me)(\\s.*|$)",
        Pattern.CASE_INSENSITIVE
    );

    private String staticFilesPath = "";
    private final AtomicBoolean shutdownInitiated = new AtomicBoolean(false);
    private AtomicInteger connectionsToClose;
    private final AtomicBoolean isServerRunning = new AtomicBoolean(false);

    public WebInterface(ChatMessageRepository messageRepository) {
        if (messageRepository == null) {
            LOGGER.error(
                "WebInterface cannot be initialized, ChatMessageRepository cannot be null"
            );
            this.messageRepository = null;
            this.server = null;
            return;
        }
        this.messageRepository = messageRepository;
        server = createServer();
        setupWebSocket();

        try {
            server.start(WebInterface.config.httpPortNumber);
            isServerRunning.getAndSet(true);
            LOGGER.info(
                "Web interface started on port {}",
                WebInterface.config.httpPortNumber
            );
        } catch (Exception e) {
            LOGGER.error(
                "Failed to start web interface on port {}",
                WebInterface.config.httpPortNumber,
                e
            );
        }
    }

    private Javalin createServer() {
        return Javalin.create((config) -> {
            staticFilesPath = WebInterface.config.staticFilesPath;

            if (staticFilesPath.equals("")) {
                config.staticFiles.add("/web", Location.CLASSPATH);
            } else {
                config.staticFiles.add(staticFilesPath, Location.EXTERNAL);
            }

            config.http.defaultContentType = "text/plain";
            config.startup.showJavalinBanner = false;

            config.routes.before((ctx) -> {
                // Note, most things that are set here are overkill as users are _supposed_ to only uses this on their local machine through localhost.
                // Or if we are being generous through a device on their own network.
                // But, as we can't be sure that someone doesn't (accidentally) opens this up to the internet we take the better safe than sorry route.
                String uri = ctx.path();

                // Allow access to the root directory ("/") but block subdirectories ending with "/"
                if (!uri.equals("/") && uri.endsWith("/")) {
                    LOGGER.warn(
                        "Unauthorized attempt to access subdirectory: " + uri
                    );
                    ctx.status(401).result("Unauthorized access");
                    return;
                }

                // Reject requests containing `..` (path traversal attack)
                // Javelin also does this, this is just to be extra secure
                if (uri.contains("..")) {
                    LOGGER.warn("Invalid path detected: " + uri);
                    ctx.status(400).result("Invalid path");
                    return;
                }

                // Security headers
                ctx.header(
                    "Content-Security-Policy",
                    "default-src 'self'; " +
                        "font-src 'self'; " +
                        "script-src 'self' 'unsafe-inline'; " +
                        "style-src 'self' 'unsafe-inline'; " +
                        "img-src 'self' data: https://textures.minecraft.net; " + // Need to fetch player textures.
                        "connect-src 'self';"
                );
                ctx.header("X-Frame-Options", "DENY"); // Prevent clickjacking
                ctx.header("X-Content-Type-Options", "nosniff"); // Prevent MIME type sniffin

                // Disable caching
                ctx.header(
                    "Cache-Control",
                    "no-store, no-cache, must-revalidate, max-age=0"
                );
                ctx.header("Pragma", "no-cache");
                ctx.header("Expires", "0");
            });
        });
    }

    private void handleReceivedMessages(WsMessageContext ctx) {
        LOGGER.info(ctx.message());
        // Parse received message from json
        IncomingWebsocketJsonMessage receivedMessage = gson.fromJson(
            ctx.message(),
            IncomingWebsocketJsonMessage.class
        );

        switch (receivedMessage.getType()) {
            case CHAT -> {
                String message = gson.fromJson(
                    receivedMessage.getPayload(),
                    String.class
                );
                if (message.trim().isEmpty()) {
                    LOGGER.warn(
                        "Received an empty message from {}",
                        ctx.session.getRemoteSocketAddress()
                    );
                    return;
                }
                LOGGER.info("Received WebSocket message: {}", message);

                // Sanitize the message
                message = sanitizeMessage(message);

                // Send the sanitized message to Minecraft chat
                sendMinecraftMessage(message);
            }
            case HISTORY -> {
                HistoryPayload historyPayload = gson.fromJson(
                    receivedMessage.getPayload(),
                    HistoryPayload.class
                );
                int requestedLimit = historyPayload.getLimit();
                int moreHistoryRequestedLimit = requestedLimit + 1; // Used further down to determine if there are more messages available in history.
                LOGGER.info(
                    "Received history request: {}",
                    historyPayload.getServerId()
                );

                List<WebsocketJsonMessage> historyMessages;
                if (historyPayload.getBefore() != null) {
                    historyMessages = messageRepository.getMessages(
                        historyPayload.getServerId(),
                        moreHistoryRequestedLimit,
                        historyPayload.getBefore()
                    );
                } else {
                    historyMessages = messageRepository.getMessages(
                        historyPayload.getServerId(),
                        moreHistoryRequestedLimit
                    );
                }

                // Let's build metadata
                WebsocketJsonMessage historyMetaDataMessage =
                    WebsocketMessageBuilder.createHistoryMetaDataMessage(
                        historyMessages,
                        requestedLimit
                    );

                // Send the history metadata first
                ctx.send(gson.toJson(historyMetaDataMessage));

                historyMessages.forEach((historicMessage) -> {
                    ctx.send(gson.toJson(historicMessage));
                });
            }
        }
    }

    private void setupWebSocket() {
        server.unsafe.routes.ws("/chat", (ws) -> {
            ws.onConnect((ctx) -> {
                // For localhost connections pinging likely isn't needed.
                // But if someone wants to use the mod on their phone or something it might be useful to include it.
                ctx.enableAutomaticPings(15, TimeUnit.SECONDS);
                LOGGER.info(
                    "New WebSocket connection from {}",
                    ctx.session.getRemoteSocketAddress() != null
                        ? ctx.session.getRemoteSocketAddress()
                        : "unknown remote address"
                );

                if (!addConnection(ctx)) {
                    LOGGER.warn(
                        "Failed to add connection: {}",
                        ctx.session.getRemoteSocketAddress()
                    );
                    return;
                }

                // If minecraft is connected to a server the client needs to know.
                // Client should never be null, but again better safe than sorry.
                MinecraftClient client = MinecraftClient.getInstance();
                if (client == null || client.world == null) {
                    return;
                }
                // Got a world, use JOIN state to communicate this
                WebsocketJsonMessage joinMessage =
                    WebsocketMessageBuilder.createConnectionStateMessage(
                        WebsocketJsonMessage.ServerConnectionStates.JOIN
                    );
                String jsonJoinMessage = gson.toJson(joinMessage);

                // Even though the client will receive the player list shortly anyway. It will be with a noticable delay.
                // So on connect make sure the list is send immediatly.
                WebsocketJsonMessage playerListMessage =
                    WebsocketMessageBuilder.createPlayerList(client);
                String jsonPlayerListMessage = gson.toJson(playerListMessage);

                try {
                    ctx.send(jsonJoinMessage);
                    ctx.send(jsonPlayerListMessage);
                } catch (Exception e) {
                    LOGGER.info(jsonJoinMessage);
                    LOGGER.info(jsonPlayerListMessage);
                    LOGGER.warn(
                        "Failed to send JOIN or PlayerList message to connection: {}",
                        ctx.session.getRemoteSocketAddress(),
                        e
                    );
                }
            });

            ws.onClose((ctx) -> {
                LOGGER.info(
                    "WebSocket connection closed: {} with status {} and reason: {}",
                    ctx.session.getRemoteSocketAddress(),
                    ctx.status(),
                    ctx.reason()
                );
                removeConnection(ctx);
            });

            ws.onMessage((ctx) -> handleReceivedMessages(ctx));

            ws.onError((ctx) -> {
                LOGGER.error("WebSocket error: ", ctx.error());
                removeConnection(ctx);
            });
        });
    }

    /**
     * Adds a connection to the set of connections.
     *
     * @param ctx The WebSocket context to add.
     * @return True if the connection was added.
     */
    private boolean addConnection(WsContext ctx) {
        if (shutdownInitiated.get()) {
            ctx.session.disconnect();
            return false;
        }

        connections.add(ctx);

        return true;
    }

    /**
     * Removes a connection from the set of connections.
     *
     * @param ctx The WebSocket context to remove.
     */
    private void removeConnection(WsContext ctx) {
        connections.remove(ctx);

        if (shutdownInitiated.get()) {
            int remaining = connectionsToClose.decrementAndGet();
            synchronized (connectionsToClose) {
                if (remaining == 0) {
                    connectionsToClose.notifyAll();
                }
            }
        }
    }

    public void shutdown() {
        // If server null there is nothing to clear up.
        if (server == null) {
            return;
        }
        boolean wasInitiated = shutdownInitiated.getAndSet(true);
        if (wasInitiated) {
            return;
        }

        connectionsToClose = new AtomicInteger(connections.size());

        connections.forEach((ctx) -> {
            try {
                // Initiates an asynchronous close of the connection.
                ctx.session.close();
            } catch (Exception e) {
                LOGGER.warn(
                    "Failed to close WebSocket connection: {}",
                    ctx.session.getRemoteSocketAddress(),
                    e
                );
            }
        });

        // Wait until all connections have been closed.
        synchronized (connectionsToClose) {
            while (connectionsToClose.get() != 0) {
                try {
                    connectionsToClose.wait(100);
                } catch (InterruptedException e) {
                    LOGGER.warn("Web interface shutdown interrupted", e);
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }

        // Server is not running.
        // Since there is a tiny chance there were connections that needed cleaning up we return here instead of sooner.
        if (!isServerRunning.get()) {
            return;
        }

        LOGGER.info("Shutting down web interface");
        server.stop();
    }

    private String sanitizeMessage(String message) {
        // Replace known illegal characters like linebreaks, control characters, zero width characters, etc
        String cleanedMessage = ILLEGAL_CHARACTERS.matcher(message).replaceAll(
            ""
        );
        // Remove multiple spaces as well
        cleanedMessage = MULTIPLE_SPACES.matcher(cleanedMessage).replaceAll(
            " "
        );
        return cleanedMessage;
    }

    private void sendMinecraftMessage(String message) {
        MinecraftClient client = MinecraftClient.getInstance();
        // Probably an edge case, if even possible but client can potentially be null
        if (client == null) {
            LOGGER.warn(
                "MinecraftClient instance is null. Cannot send message."
            );
            return;
        }

        client.execute(() -> {
            ClientPlayerEntity player = client.player;
            if (player == null) {
                LOGGER.warn("Player value is null. Cannot send message.");
                return;
            }

            int maxLength = 256;
            if (SUPPORTED_COMMANDS.matcher(message).matches()) {
                String slash = "/";
                int end = Math.min(
                    message.length(),
                    maxLength + slash.length()
                );
                // Remove the leading slash and truncate to maxLength.
                player.networkHandler.sendChatCommand(
                    message.substring(slash.length(), end)
                );
                return;
            }

            if (message.length() <= maxLength) {
                player.networkHandler.sendChatMessage(message);
                return;
            }

            // Break long messages into smaller chunks
            for (int i = 0; i < message.length(); i += maxLength) {
                int end = Math.min(i + maxLength, message.length());
                player.networkHandler.sendChatMessage(
                    message.substring(i, end)
                );
            }
        });
    }

    public void broadcastMessage(WebsocketJsonMessage message) {
        if (server == null || connections == null || connections.isEmpty()) {
            return;
        }
        String jsonMessage = gson.toJson(message);
        connections.forEach((ctx) -> {
            try {
                ctx.send(jsonMessage);
            } catch (Exception e) {
                LOGGER.info(jsonMessage);
                LOGGER.warn(
                    "Failed to send message to connection: {}",
                    ctx.session.getRemoteSocketAddress(),
                    e
                );
            }
        });
    }

    public int getCurrentPort() {
        if (server == null || !isServerRunning.get()) {
            return -1;
        }
        return server.port();
    }

    public String getCurrentPath() {
        if (server == null) {
            return "";
        }
        return staticFilesPath;
    }
}
