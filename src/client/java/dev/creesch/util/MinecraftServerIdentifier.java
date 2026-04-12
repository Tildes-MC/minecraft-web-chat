package dev.creesch.util;

import dev.creesch.model.WebsocketJsonMessage;
import java.nio.file.Path;
import java.util.UUID;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.server.IntegratedServer;
import net.minecraft.world.level.storage.LevelResource;

/**
 * Utility class for identifying Minecraft servers and worlds.
 * Provides consistent identification for singleplayer (LAN) worlds and multiplayer servers.
 */
public class MinecraftServerIdentifier {

    /**
     * Default server info returned when not connected to any world/server.
     * Should not happen in the current mod setup. But better to account for it.
     * Also allows for sending messages in the future when a user is not connected to a server.
     */
    private static final Minecraft client = Minecraft.getInstance();
    private static final WebsocketJsonMessage.ChatServerInfo DISCONNECTED =
        new WebsocketJsonMessage.ChatServerInfo("Disconnected", "disconnected");

    /**
     * Gets information about the current server or world the player is connected to.
     *
     * For singleplayer worlds (including LAN):
     * - name: The world name
     * - identifier: UUID generated from relative path to world save
     *
     * For multiplayer servers:
     * - name: Server label or address if label is not available
     * - identifier: UUID generated from server address
     *
     * @return ChatServerInfo containing the name and unique identifier of the current server/world.
     *         Returns DISCONNECTED if not connected to any world or server.
     */
    public static WebsocketJsonMessage.ChatServerInfo getCurrentServerInfo() {
        // World is null, so we can't be on a minecraft server of any kind.
        if (client.level == null) {
            return DISCONNECTED;
        }

        // For single player we can use the levelname for the name.
        // But to ensure a unique identifier we are using the save path as worlds can have the same name.
        if (client.hasSingleplayerServer()) {
            IntegratedServer server = client.getSingleplayerServer();
            if (server == null) {
                return DISCONNECTED;
            }

            String worldName = server.getWorldData().getLevelName();

            // To create a unique identifier use the save path as world names are not unique.
            // Use relative path so users can still move minecraft directories to a different location.
            Path minecraftDir = client.gameDirectory.toPath();
            Path savePath = server.getWorldPath(LevelResource.ROOT);
            String rawIdentifier = minecraftDir.relativize(savePath).toString();

            return new WebsocketJsonMessage.ChatServerInfo(
                worldName,
                UUID.nameUUIDFromBytes(rawIdentifier.getBytes()).toString()
            );
        } else {
            ServerData serverInfo = client.getCurrentServer();
            if (serverInfo == null) {
                return DISCONNECTED;
            }

            // It is very unlikely that name is null for servers. But just in case fall back to the server address.
            String serverName =
                serverInfo.name != null ? serverInfo.name : serverInfo.ip;
            String serverIdentifier = UUID.nameUUIDFromBytes(
                serverInfo.ip.getBytes()
            ).toString();
            return new WebsocketJsonMessage.ChatServerInfo(
                serverName,
                serverIdentifier
            );
        }
    }
}
