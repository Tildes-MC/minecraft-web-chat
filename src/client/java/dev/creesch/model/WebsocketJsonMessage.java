package dev.creesch.model;

import com.google.gson.annotations.SerializedName;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class WebsocketJsonMessage {

    private long timestamp;
    private ChatServerInfo server;
    private MessageType type;
    private String minecraftVersion;
    private String modVersion;
    private Object payload;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ChatServerInfo {

        private String name;
        private String identifier;
    }

    public enum MessageType {
        @SerializedName("chatMessage")
        CHAT_MESSAGE,

        @SerializedName("serverConnectionState")
        SERVER_CONNECTION_STATE,

        @SerializedName("historyMetaData")
        HISTORY_META_DATA,

        @SerializedName("serverPlayerList")
        SERVER_PLAYER_LIST,
    }

    /**
     *  Using same naming as used by {@link net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents}
     */
    public enum ServerConnectionStates {
        @SerializedName("init")
        INIT,

        @SerializedName("join")
        JOIN,

        @SerializedName("disconnect")
        DISCONNECT,
    }

    // Private constructor to force use of factory methods
    private WebsocketJsonMessage(
        long timestamp,
        ChatServerInfo server,
        MessageType type,
        Object payload,
        String minecraftVersion,
        String modVersion
    ) {
        this.timestamp = timestamp;
        this.server = server;
        this.type = type;
        this.payload = payload;
        this.minecraftVersion = minecraftVersion;
        this.modVersion = modVersion;
    }

    public static WebsocketJsonMessage createChatMessage(
        long timestamp,
        ChatServerInfo server,
        ChatMessagePayload message,
        String minecraftVersion,
        String modVersion
    ) {
        return new WebsocketJsonMessage(
            timestamp,
            server,
            MessageType.CHAT_MESSAGE,
            message,
            minecraftVersion,
            modVersion
        );
    }

    public static WebsocketJsonMessage createServerConnectionStateMessage(
        long timestamp,
        ChatServerInfo server,
        ServerConnectionStates state,
        String minecraftVersion,
        String modVersion
    ) {
        return new WebsocketJsonMessage(
            timestamp,
            server,
            MessageType.SERVER_CONNECTION_STATE,
            state,
            minecraftVersion,
            modVersion
        );
    }

    public static WebsocketJsonMessage createHistoryMetaDataMessage(
        long timestamp,
        ChatServerInfo server,
        long oldestMessageTimestamp,
        boolean moreHistoryAvailable,
        String minecraftVersion,
        String modVersion
    ) {
        HistoryMetaDataPayload historyMetaDataPayload =
            HistoryMetaDataPayload.builder()
                .moreHistoryAvailable(moreHistoryAvailable)
                .oldestMessageTimestamp(oldestMessageTimestamp)
                .build();

        return new WebsocketJsonMessage(
            timestamp,
            server,
            MessageType.HISTORY_META_DATA,
            historyMetaDataPayload,
            minecraftVersion,
            modVersion
        );
    }

    public static WebsocketJsonMessage createServerPlayerListMessage(
        long timestamp,
        ChatServerInfo server,
        List<PlayerListInfoEntry> playerList,
        String minecraftVersion,
        String modVersion
    ) {
        return new WebsocketJsonMessage(
            timestamp,
            server,
            MessageType.SERVER_PLAYER_LIST,
            playerList,
            minecraftVersion,
            modVersion
        );
    }
}
