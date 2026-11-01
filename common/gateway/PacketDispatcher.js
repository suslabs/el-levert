class PacketDispatcher {
    static dispatchServer(packet, manager, socket) {
        packet.handleServer(manager, socket);
    }

    static dispatchClient(packet, client) {
        packet.handleClient(client);
    }
}

export default PacketDispatcher;

