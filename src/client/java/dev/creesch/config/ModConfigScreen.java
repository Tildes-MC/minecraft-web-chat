package dev.creesch.config;

import dev.creesch.WebchatClient;
import dev.isxander.yacl3.api.*;
import dev.isxander.yacl3.api.controller.BooleanControllerBuilder;
import dev.isxander.yacl3.api.controller.IntegerFieldControllerBuilder;
import dev.isxander.yacl3.api.controller.StringControllerBuilder;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public class ModConfigScreen {

    public static Screen createScreen(Screen parent) {
        YetAnotherConfigLib.Builder builder =
            YetAnotherConfigLib.createBuilder().title(
                Component.literal("Web Chat Configuration")
            );

        builder.category(
            ConfigCategory.createBuilder()
                .name(Component.literal("Message Settings"))
                .group(
                    OptionGroup.createBuilder()
                        .name(Component.literal("Ping Settings"))
                        .option(
                            Option.<Boolean>createBuilder()
                                .name(Component.literal("Ping on Username"))
                                .description(
                                    OptionDescription.of(
                                        Component.literal(
                                            "Enable ping on username.\n" +
                                                "This will ping the browser window any time a player's username appears in the chat " +
                                                "(case insensitive)."
                                        )
                                    )
                                )
                                .binding(
                                    ModConfig.HANDLER.defaults().pingOnUsername,
                                    () ->
                                        ModConfig.HANDLER.instance().pingOnUsername,
                                    (val) ->
                                        ModConfig.HANDLER.instance().pingOnUsername =
                                            val
                                )
                                .controller(BooleanControllerBuilder::create)
                                .build()
                        )
                        .build()
                )
                .group(
                    ListOption.<String>createBuilder()
                        .name(Component.literal("Extra Ping Keywords"))
                        .description(
                            OptionDescription.of(
                                Component.literal(
                                    "Extra keywords to ping on.\n" +
                                        "This will ping the browser window any time one of these words appear in the chat " +
                                        "(case insensitive)."
                                )
                            )
                        )
                        .binding(
                            ModConfig.HANDLER.defaults().pingKeywords,
                            () -> ModConfig.HANDLER.instance().pingKeywords,
                            (val) ->
                                ModConfig.HANDLER.instance().pingKeywords = val
                        )
                        .controller(StringControllerBuilder::create)
                        .initial("")
                        .build()
                )
                .build()
        );

        builder.category(
            ConfigCategory.createBuilder()
                .name(Component.literal("Network Settings"))
                .group(
                    OptionGroup.createBuilder()
                        .name(Component.literal("Port Settings"))
                        .option(
                            Option.<Integer>createBuilder()
                                .name(Component.literal("HTTP Port"))
                                .description(
                                    OptionDescription.of(
                                        Component.literal(
                                            "Port number used to serve the web interface.\n" +
                                                "Make sure that this port is available."
                                        )
                                    )
                                )
                                .binding(
                                    ModConfig.HANDLER.defaults().httpPortNumber,
                                    () ->
                                        ModConfig.HANDLER.instance().httpPortNumber,
                                    (val) ->
                                        ModConfig.HANDLER.instance().httpPortNumber =
                                            val
                                )
                                .controller((opt) ->
                                    IntegerFieldControllerBuilder.create(opt)
                                        .range(1024, 65535)
                                        .formatValue((value) ->
                                            Component.literal(
                                                String.valueOf(value)
                                            )
                                        )
                                )
                                .build()
                        )
                        .build()
                )
                .build()
        );

        if (ModConfig.HANDLER.instance().developmentMode) {
            builder.category(
                ConfigCategory.createBuilder()
                    .name(Component.literal("Development Settings"))
                    .group(
                        OptionGroup.createBuilder()
                            .name(Component.literal("Static Files Path"))
                            .option(
                                Option.<String>createBuilder()
                                    .name(Component.literal("Path"))
                                    .description(
                                        OptionDescription.of(
                                            Component.literal(
                                                "Path to the static files for the web interface.\n" +
                                                    "Leave blank to use files included in the mod jar."
                                            )
                                        )
                                    )
                                    .binding(
                                        ModConfig.HANDLER.defaults().staticFilesPath,
                                        () ->
                                            ModConfig.HANDLER.instance().staticFilesPath,
                                        (val) ->
                                            ModConfig.HANDLER.instance().staticFilesPath =
                                                val
                                    )
                                    .controller(StringControllerBuilder::create)
                                    .build()
                            )
                            .build()
                    )
                    .build()
            );
        }

        builder.save(() -> {
            ModConfig.HANDLER.save();
            WebchatClient.onConfigChanged();
        });

        return builder.build().generateScreen(parent);
    }
}
