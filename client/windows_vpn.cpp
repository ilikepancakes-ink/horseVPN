#include <iostream>
#include <string>
#include <windows.h>
#include <ras.h>
#include <shellapi.h>

#pragma comment(lib, "rasapi32.lib")
#pragma comment(lib, "shell32.lib")

bool IsUserAdmin() {
    BOOL isAdmin = FALSE;
    SID_IDENTIFIER_AUTHORITY ntAuthority = SECURITY_NT_AUTHORITY;
    PSID adminGroup;
    if (AllocateAndInitializeSid(&ntAuthority, 2, SECURITY_BUILTIN_DOMAIN_RID, DOMAIN_ALIAS_RID_ADMINS, 0, 0, 0, 0, 0, 0, &adminGroup)) {
        if (!CheckTokenMembership(NULL, adminGroup, &isAdmin)) {
            isAdmin = FALSE;
        }
        FreeSid(adminGroup);
    }
    return isAdmin;
}

void RunAsAdmin(int argc, char* argv[]) {
    SHELLEXECUTEINFO sei = { sizeof(sei) };
    sei.lpVerb = "runas";
    sei.lpFile = argv[0];
    sei.lpParameters = argc > 1 ? argv[1] : NULL;
    sei.hwnd = NULL;
    sei.nShow = SW_NORMAL;

    if (!ShellExecuteEx(&sei)) {
        std::cerr << "Failed to elevate privileges" << std::endl;
    }
}

int main(int argc, char* argv[]) {
    if (!IsUserAdmin()) {
        RunAsAdmin(argc, argv);
        return 0;
    }

    if (argc < 2) {
        std::cerr << "Usage: windows_vpn <route>" << std::endl;
        return 1;
    }

    std::string route = argv[1];

    // Extract host from route
    size_t start = route.find("://") + 3;
    size_t end = route.find(":", start);
    if (end == std::string::npos) end = route.find("/", start);
    std::string host = route.substr(start, end - start);

    const char* allowedConnection = "HorseVPN";
    RASDIALPARAMS params = {0};
    params.dwSize = sizeof(RASDIALPARAMS);
    strcpy(params.szEntryName, allowedConnection);

    RASENTRY entry = {0};
    entry.dwSize = sizeof(RASENTRY);
    DWORD size = sizeof(RASENTRY);
    DWORD result = RasGetEntryProperties(NULL, allowedConnection, &entry, &size, NULL, NULL);
    if (result != 0) {
        std::cerr << "VPN connection not found or invalid" << std::endl;
        return 1;
    }

    result = RasDial(NULL, NULL, &params, 0, NULL, NULL);

    if (result == 0) {
        std::cout << "VPN connected" << std::endl;
    } else {
        std::cerr << "Failed to connect VPN: " << result << std::endl;
        return 1;
    }

    return 0;
}
