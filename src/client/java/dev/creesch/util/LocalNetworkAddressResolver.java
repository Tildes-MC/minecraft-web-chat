package dev.creesch.util;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;

/**
 * Resolves the address this machine is reachable at on the local network, for
 * both IPv4 and IPv6.
 */
public final class LocalNetworkAddressResolver {

    private static final NamedLogger LOGGER = new NamedLogger("web-chat");

    private LocalNetworkAddressResolver() {}

    /**
     * How preferable an address is as the LAN host other devices should use to
     * reach this machine, from least to most preferred. The constants are
     * declared in ascending order of preference so that the natural ordering
     * ({@link Enum#compareTo}) can be used to pick the best candidate.
     * <p>
     * IPv4 site-local addresses are preferred over IPv6 because they are the
     * most broadly reachable. Within each family a physical Ethernet/Wi-Fi
     * interface beats a bridge/VM one, and IPv6 unique-local addresses
     * (fc00::/7) are preferred over globally routable ones.
     */
    private enum AddressPreference {
        /** Not usable as a LAN host (e.g. link-local IPv6, non-site-local IPv4). */
        UNUSABLE,
        IPV6_GLOBAL_VIRTUAL,
        IPV6_GLOBAL_PHYSICAL,
        IPV6_UNIQUE_LOCAL_VIRTUAL,
        IPV6_UNIQUE_LOCAL_PHYSICAL,
        IPV4_SITE_LOCAL_VIRTUAL,
        IPV4_SITE_LOCAL_PHYSICAL,
    }

    /**
     * Resolves the address this machine is reachable at on the local network.
     * <p>
     * The web interface is meant to be opened from the local IP rather than
     * {@code localhost}/{@code 127.0.0.1} so that the address (and the QR code
     * built from it in the browser) also works from other devices, like a
     * phone, on the same network. Both IPv4 and IPv6 addresses are considered.
     * Falls back to {@code localhost} if no local network address can be
     * determined.
     *
     * @return The local network host, or {@code localhost} as a fallback.
     *     IPv6 results are bracketed (e.g. {@code [fd12::1]}) so they can be
     *     dropped straight into a URL.
     */
    public static String resolveLocalNetworkHost() {
        String bestHost = null;
        AddressPreference bestPreference = AddressPreference.UNUSABLE;

        try {
            for (NetworkInterface networkInterface : Collections.list(
                NetworkInterface.getNetworkInterfaces()
            )) {
                // Ignore offline interfaces
                if (!networkInterface.isUp()) {
                    continue;
                }

                // Ignore localhost
                if (networkInterface.isLoopback()) {
                    continue;
                }

                // Ignore private tunnels
                if (networkInterface.isPointToPoint()) {
                    continue;
                }

                // Ignore virtual interfaces
                if (networkInterface.isVirtual()) {
                    continue;
                }

                boolean physical = isPhysicalInterfaceName(
                    networkInterface.getName()
                );
                for (InetAddress address : Collections.list(
                    networkInterface.getInetAddresses()
                )) {
                    // A strict comparison keeps the first address seen on ties,
                    // matching the previous "first match wins" fallback.
                    AddressPreference preference = ratePreference(
                        address,
                        physical
                    );
                    if (preference.compareTo(bestPreference) > 0) {
                        bestPreference = preference;
                        bestHost = formatHostForUrl(address);
                    }
                }
            }
        } catch (Exception e) {
            LOGGER.warn(
                "Could not scan network interfaces for a local address",
                e
            );
        }

        if (bestPreference == AddressPreference.UNUSABLE) {
            return "localhost";
        }

        return bestHost;
    }

    /**
     * Rates how suitable an address is as the LAN host other devices should
     * use to reach this machine. Link-local IPv6 (fe80::/10) is rejected
     * because it requires a per-host scope id and so is not portable in a URL.
     *
     * @param address The candidate address.
     * @param physical Whether it lives on a likely physical LAN interface.
     * @return The preference for this address, or
     *     {@link AddressPreference#UNUSABLE} if it cannot be used.
     */
    private static AddressPreference ratePreference(
        InetAddress address,
        boolean physical
    ) {
        if (address instanceof Inet4Address) {
            if (!address.isSiteLocalAddress()) {
                return AddressPreference.UNUSABLE;
            }

            return physical
                ? AddressPreference.IPV4_SITE_LOCAL_PHYSICAL
                : AddressPreference.IPV4_SITE_LOCAL_VIRTUAL;
        }

        if (address instanceof Inet6Address) {
            if (
                address.isLinkLocalAddress() ||
                address.isLoopbackAddress() ||
                address.isMulticastAddress() ||
                address.isAnyLocalAddress()
            ) {
                return AddressPreference.UNUSABLE;
            }

            // Unique-local addresses (fc00::/7) are the IPv6 equivalent of
            // private IPv4 ranges; prefer them over globally routable ones.
            boolean uniqueLocal = (address.getAddress()[0] & 0xfe) == 0xfc;
            if (uniqueLocal) {
                return physical
                    ? AddressPreference.IPV6_UNIQUE_LOCAL_PHYSICAL
                    : AddressPreference.IPV6_UNIQUE_LOCAL_VIRTUAL;
            }

            return physical
                ? AddressPreference.IPV6_GLOBAL_PHYSICAL
                : AddressPreference.IPV6_GLOBAL_VIRTUAL;
        }

        return AddressPreference.UNUSABLE;
    }

    /**
     * Formats an address for use as the host part of a URL, wrapping IPv6
     * addresses in brackets (e.g. {@code [fd12::1]}) as required by RFC 2732.
     *
     * @param address The address to format.
     * @return The host string, bracketed for IPv6.
     */
    private static String formatHostForUrl(InetAddress address) {
        String host = address.getHostAddress();
        if (address instanceof Inet6Address) {
            // Drop any scope id (e.g. "%en0"). We only score scope-free
            // addresses as usable, but strip defensively to keep the URL valid.
            int scopeSeparator = host.indexOf('%');
            if (scopeSeparator >= 0) {
                host = host.substring(0, scopeSeparator);
            }

            return "[" + host + "]";
        }

        return host;
    }

    /**
     * Whether an interface name looks like a physical Ethernet or Wi-Fi
     * adapter (e.g. {@code en0}, {@code eth0}, {@code wlan0}) as opposed to a
     * virtual/bridge adapter (e.g. {@code docker0}, {@code br-...}).
     *
     * @param name The interface name from {@link NetworkInterface#getName()}.
     * @return {@code true} for likely physical LAN interfaces.
     */
    private static boolean isPhysicalInterfaceName(String name) {
        if (name == null) {
            return false;
        }

        return (
            name.startsWith("en") ||
            name.startsWith("eth") ||
            name.startsWith("wl")
        );
    }
}
