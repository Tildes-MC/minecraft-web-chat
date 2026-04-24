package dev.creesch;

import dev.creesch.config.ModConfig;
import dev.creesch.model.WebsocketJsonMessage;
import dev.creesch.model.WebsocketMessageBuilder;
import dev.creesch.storage.ChatMessageRepository;
import dev.creesch.util.NamedLogger;
import java.net.URI;
import java.util.concurrent.atomic.AtomicBoolean;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;

public class WebchatClient implements ClientModInitializer {

    private static final NamedLogger LOGGER = new NamedLogger("web-chat");
    private WebInterface webInterface;
    private ChatMessageRepository messageRepository;
    private int tickCounter = 0;
    private static WebchatClient INSTANCE;
    private static String MOD_VERSION = "unknown";
    private static AtomicBoolean hasJoined = new AtomicBoolean(false);

    @Override
    public void onInitializeClient() {
        if (INSTANCE != null) {
            LOGGER.error("WebchatClient already initialized");
            return;
        }

        INSTANCE = this;
        MOD_VERSION = FabricLoader.getInstance()
            .getModContainer("web-chat")
            .get()
            .getMetadata()
            .getVersion()
            .getFriendlyString();

        ModConfig.init();
        messageRepository = new ChatMessageRepository();
        webInterface = new WebInterface(messageRepository);

        LOGGER.info("web chat loaded");

        // Chat messages from users.
        ClientReceiveMessageEvents.CHAT.register(
            (message, signedMessage, sender, params, receptionTimestamp) -> {
                Minecraft client = Minecraft.getInstance();
                String selfName =
                    client.player == null
                        ? ""
                        : client.player.getName().getString();

                boolean fromSelf =
                    sender == null ? false : sender.name().equals(selfName);
                try {
                    WebsocketJsonMessage chatMessage =
                        WebsocketMessageBuilder.createLiveChatMessage(
                            message,
                            fromSelf,
                            client
                        );
                    messageRepository.saveMessage(chatMessage);
                    webInterface.broadcastMessage(chatMessage);
                } catch (Exception e) {
                    LOGGER.warn("Could not process chat message.", e);
                }
            }
        );

        // System messages (joins, leaves, deaths, etc.)
        ClientReceiveMessageEvents.GAME.register((message, overlay) -> {
            try {
                WebsocketJsonMessage chatMessage =
                    WebsocketMessageBuilder.createLiveChatMessage(
                        message,
                        false,
                        Minecraft.getInstance()
                    );
                messageRepository.saveMessage(chatMessage);
                webInterface.broadcastMessage(chatMessage);
            } catch (Exception e) {
                LOGGER.warn("Could not process game message.", e);
            }
        });

        // Send state to client so history can be cleared
        ClientPlayConnectionEvents.INIT.register((handler, client) -> {
            webInterface.broadcastMessage(
                WebsocketMessageBuilder.createConnectionStateMessage(
                    WebsocketJsonMessage.ServerConnectionStates.INIT
                )
            );
        });

        // When joining a server:
        //  1. Send state to clients
        //  2. Send a clickable message with the web interface URL
        ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> {
            client.execute(() -> {
                if (client.player == null) {
                    return;
                }

                // Send join event
                webInterface.broadcastMessage(
                    WebsocketMessageBuilder.createConnectionStateMessage(
                        WebsocketJsonMessage.ServerConnectionStates.JOIN
                    )
                );

                // Even though the clients will receive the player list shortly anyway. It will be with a noticable delay.
                // So on join make sure the list is send immediatly.
                webInterface.broadcastMessage(
                    WebsocketMessageBuilder.createPlayerList(client)
                );

                boolean wasJoined = hasJoined.getAndSet(true);
                if (wasJoined) {
                    // JOIN event can occur multiple times per server connection.
                    // Ensure the web address is only shown once per connection.
                    return;
                }

                showWebAddress(client);
            });
        });

        // Send state to client
        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
            hasJoined.set(false);
            webInterface.broadcastMessage(
                WebsocketMessageBuilder.createConnectionStateMessage(
                    WebsocketJsonMessage.ServerConnectionStates.DISCONNECT
                )
            );
        });

        // Properly handle minecraft shutting down.
        ClientLifecycleEvents.CLIENT_STOPPING.register((client) -> {
            if (webInterface == null) {
                return;
            }

            webInterface.shutdown();
        });

        // For the client in fabric there are no events to listen for other players joining or leaving the server.
        // In order to do that a mixin would be needed to directly access minecraft.
        // Considering that reading the player list is a fairly low impact operation it simply
        // works out to just send clients updates every couple of ticks.
        ClientTickEvents.END_CLIENT_TICK.register((client) -> {
            // Only used to send player list updates. So a client is needed and a world (on a server)
            if (client == null || client.level == null) {
                return;
            }

            tickCounter++;
            // Send update every 80 ticks (~4 seconds depending on circumstances in game)
            // Not fast but should be good enough for most use cases.
            if (tickCounter % 80 == 0) {
                // Send player list
                webInterface.broadcastMessage(
                    WebsocketMessageBuilder.createPlayerList(client)
                );

                tickCounter = 0; // Reset counter
            }
        });
    }

    public static void onConfigChanged() {
        if (INSTANCE == null) {
            return;
        }
        if (INSTANCE.webInterface == null) {
            return;
        }

        boolean portChanged =
            INSTANCE.webInterface.getCurrentPort() !=
            ModConfig.HANDLER.instance().httpPortNumber;

        boolean pathChanged =
            INSTANCE.webInterface.getCurrentPath() !=
            ModConfig.HANDLER.instance().staticFilesPath;

        if (portChanged || pathChanged) {
            INSTANCE.webInterface.shutdown();
            INSTANCE.webInterface = new WebInterface(
                INSTANCE.messageRepository
            );
            INSTANCE.showWebAddress(Minecraft.getInstance());
        }
    }

    public static String getModVersion() {
        return MOD_VERSION;
    }

    private void showWebAddress(Minecraft client) {
        if (client == null || client.player == null) {
            return;
        }
        String webchatPort = String.valueOf(
            ModConfig.HANDLER.instance().httpPortNumber
        );
        Component message = Component.literal("Web chat: ").append(
            Component.literal("http://localhost:" + webchatPort)
                .withStyle(ChatFormatting.BLUE, ChatFormatting.UNDERLINE)
                .withStyle((style) ->
                    style.withClickEvent(
                        new ClickEvent.OpenUrl(
                            URI.create("http://localhost:" + webchatPort)
                        )
                    )
                )
        );
        client.player.sendSystemMessage(message);
    }
}
