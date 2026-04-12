package dev.creesch.util;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import net.minecraft.core.Holder;
import net.minecraft.locale.Language;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemStackTemplate;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.ItemEnchantments;

public class ClientTranslationUtils {

    /**
     * Extracts all translation keys from a Text object and returns a map of key-value pairs with their translations.
     *
     * @param text The Text object to process.
     * @return A map where keys are translation keys and values are the corresponding translations.
     */
    public static Map<String, String> extractTranslations(Component text) {
        Map<String, String> translations = new HashMap<>();
        collectTranslationKeys(text, translations);

        // Fetch translations for the collected keys
        populateTranslations(translations);

        return translations;
    }

    private static void collectTranslationKeys(
        Component text,
        Map<String, String> keys
    ) {
        if (
            text.getContents() instanceof
                TranslatableContents translatableContent
        ) {
            String key = translatableContent.getKey();
            keys.putIfAbsent(key, null);

            // Process arguments of the translation
            for (Object arg : translatableContent.getArgs()) {
                if (arg instanceof Component nestedText) {
                    collectTranslationKeys(nestedText, keys); // Recursively handle nested Component
                } else if (arg instanceof String stringArg) {
                    keys.putIfAbsent(stringArg, null); // Treat plain strings as potential keys. Highly unlikely to ever happen, maybe impossible? Doesn't hurt to account for it.
                }
            }
        }

        // Collect keys from siblings (e.g., appended text)
        for (Component sibling : text.getSiblings()) {
            collectTranslationKeys(sibling, keys);
        }

        // Check hover event for additional text that may contain translation keys
        HoverEvent hoverEvent = text.getStyle().getHoverEvent();
        if (hoverEvent == null) {
            return;
        }

        // Handle different hover event types
        if (hoverEvent instanceof HoverEvent.ShowText(Component value)) {
            if (value != null) {
                collectTranslationKeys(value, keys);
            }
        }

        if (
            hoverEvent instanceof
                HoverEvent.ShowEntity(
                    HoverEvent.EntityTooltipInfo hoverEventEntityContent
                )
        ) {
            if (hoverEventEntityContent != null) {
                // Collect entity type translation key (e.g., "entity.minecraft.player")
                String entityKey =
                    hoverEventEntityContent.type.getDescriptionId();
                keys.putIfAbsent(entityKey, null);

                Optional<Component> entityName = hoverEventEntityContent.name;
                entityName.ifPresent((value) ->
                    collectTranslationKeys(value, keys)
                );
            }
        }

        // Collect translation keys from show_item hover events
        if (
            hoverEvent instanceof
                HoverEvent.ShowItem(ItemStackTemplate itemTemplate)
        ) {
            ItemStack itemStack = itemTemplate.create();
            // Collect item translation key (e.g., "item.minecraft.bow")
            String itemKey = itemStack.getItem().getDescriptionId();
            keys.putIfAbsent(itemKey, null);

            // Collect enchantment translation keys
            ItemEnchantments enchantments = itemStack.getEnchantments();
            for (Holder<Enchantment> enchantment : enchantments.keySet()) {
                Component desc = enchantment.value().description();
                collectTranslationKeys(desc, keys);
            }
        }
    }

    private static void populateTranslations(Map<String, String> keys) {
        Language language = Language.getInstance(); // Client-side Language instance
        for (Map.Entry<String, String> entry : keys.entrySet()) {
            entry.setValue(
                language.getOrDefault(entry.getKey(), entry.getKey())
            ); // Fallback to key if translation is missing
        }
    }
}
