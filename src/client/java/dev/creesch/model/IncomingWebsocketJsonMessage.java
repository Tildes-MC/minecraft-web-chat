package dev.creesch.model;

import com.google.gson.JsonElement;
import com.google.gson.annotations.SerializedName;
import lombok.Data;

@Data
public class IncomingWebsocketJsonMessage {

    private MessageType type;

    // Gson stores unknown objects as LinkedTreeMap by default when the target field is typed as Object/
    // This would cause issues in the way this class is used when receiving messages.
    // Instead, the payload is cast to a JsonElement to be cast more specifically once the type is known.
    private JsonElement payload;

    public enum MessageType {
        @SerializedName("chat")
        CHAT,

        @SerializedName("history")
        HISTORY,
    }

    // Nested class for history payload.
    @Data
    public static class HistoryPayload {

        private String serverId;

        private int limit;

        private Long before; // Optional field, can be null
    }
}
