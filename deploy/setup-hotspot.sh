#!/usr/bin/env bash
#
# Casino System — Setup Wi-Fi Hotspot
# --------------------------------------------------------
# Поднимает открытую точку доступа "Casino-Setup-XXXX" (192.168.44.1/24),
# которая перенаправляет любой HTTP-запрос на http://192.168.44.1/setup
# (captive portal через dnsmasq address=/#/192.168.44.1).
#
# Использование:
#   sudo ./setup-hotspot.sh start <iface> <ssid>
#   sudo ./setup-hotspot.sh stop  <iface>
#
set -euo pipefail

ACTION="${1:-}"
IFACE="${2:-}"
SSID="${3:-Casino-Setup}"
AP_IP="192.168.44.1"
AP_NET="192.168.44.0/24"
DHCP_RANGE="192.168.44.10,192.168.44.100,12h"

[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
[[ -n "$ACTION" && -n "$IFACE" ]] || { echo "usage: $0 start|stop <iface> [ssid]" >&2; exit 1; }

HOSTAPD_CONF="/etc/hostapd/casino-setup.conf"
DNSMASQ_CONF="/etc/dnsmasq.d/casino-setup.conf"

case "$ACTION" in
  start)
    # NetworkManager не должен трогать этот интерфейс
    nmcli dev set "$IFACE" managed no 2>/dev/null || true

    ip link set "$IFACE" down
    ip addr flush dev "$IFACE"
    ip addr add "${AP_IP}/24" dev "$IFACE"
    ip link set "$IFACE" up

    cat > "$HOSTAPD_CONF" <<CFG
interface=$IFACE
driver=nl80211
ssid=$SSID
hw_mode=g
channel=6
auth_algs=1
wmm_enabled=1
CFG

    cat > "$DNSMASQ_CONF" <<CFG
interface=$IFACE
bind-interfaces
dhcp-range=$DHCP_RANGE
# captive portal: любой домен → наш IP
address=/#/${AP_IP}
# отвечаем на все probe URL Android/iOS
address=/connectivitycheck.gstatic.com/${AP_IP}
address=/captive.apple.com/${AP_IP}
CFG

    systemctl restart dnsmasq
    systemctl restart hostapd || hostapd -B "$HOSTAPD_CONF"

    # nginx уже слушает :80 на всех интерфейсах и отдаёт /setup
    echo "[hotspot] SSID=$SSID  URL=http://${AP_IP}/setup"
    ;;

  stop)
    systemctl stop hostapd 2>/dev/null || true
    rm -f "$HOSTAPD_CONF" "$DNSMASQ_CONF"
    systemctl restart dnsmasq 2>/dev/null || true
    ip addr flush dev "$IFACE" 2>/dev/null || true
    nmcli dev set "$IFACE" managed yes 2>/dev/null || true
    echo "[hotspot] stopped"
    ;;

  *)
    echo "unknown action: $ACTION" >&2; exit 1 ;;
esac
