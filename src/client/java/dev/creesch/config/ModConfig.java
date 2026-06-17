package dev.creesch.config;

import com.google.gson.GsonBuilder;
import dev.isxander.yacl3.config.v2.api.ConfigClassHandler;
import dev.isxander.yacl3.config.v2.api.SerialEntry;
import dev.isxander.yacl3.config.v2.api.serializer.GsonConfigSerializerBuilder;
import java.util.Arrays;
import java.util.List;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.resources.Identifier;

public class ModConfig {

    public static ConfigClassHandler<ModConfig> HANDLER =
        ConfigClassHandler.createBuilder(ModConfig.class)
            .id(Identifier.fromNamespaceAndPath("web-chat", "web-config"))
            .serializer((config) ->
                GsonConfigSerializerBuilder.create(config)
                    .setPath(
                        FabricLoader.getInstance()
                            .getConfigDir()
                            .resolve("web-chat.json5")
                    )
                    .appendGsonBuilder(GsonBuilder::setPrettyPrinting) // not needed, pretty print by default
                    .setJson5(true)
                    .build()
            )
            .build();

    @SerialEntry(comment = "Port number used to serve the webinterface")
    public int httpPortNumber = 8080;

    @SerialEntry(
        comment = "Open the web chat to your local network so other devices (like your phone) can connect. " +
            "When disabled the chat is only reachable from this computer through localhost."
    )
    public boolean openChatToLan = true;

    @SerialEntry(comment = "Enable ping on username")
    public boolean pingOnUsername = true;

    @SerialEntry(comment = "Extra ping keywords")
    public List<String> pingKeywords = Arrays.asList();

    @SerialEntry(comment = "Enable development mode")
    public boolean developmentMode = false;

    @SerialEntry(comment = "Web interface static files path")
    public String staticFilesPath = "";

    public static void init() {
        HANDLER.load();
    }
}
