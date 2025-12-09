#include <iostream>
#include <string>
#include <cstdlib>

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: linux_vpn <route>" << std::endl;
        return 1;
    }

    std::string route = argv[1];

    // Assume route is wss://host:port, extract host
    size_t start = route.find("://") + 3;
    size_t end = route.find(":", start);
    if (end == std::string::npos) end = route.find("/", start);
    std::string host = route.substr(start, end - start);

    // Use nmcli to connect to a predefined VPN connection
    // Assuming a VPN connection named "horsevpn" is configured with the server
    std::string command = "sudo nmcli connection up horsevpn";
    int result = system(command.c_str());

    if (result == 0) {
        std::cout << "VPN connected" << std::endl;
    } else {
        std::cerr << "Failed to connect VPN" << std::endl;
        return 1;
    }

    return 0;
}
