#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <jni.h>
#include <filesystem>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

// A real JVM host: no java.exe child is created. Keep the supervisor's Java
// arguments, inherited pipes, exit code and process lifetime contract intact.
static void diagnostic(const char* message) {
    const std::string line = std::string("Nuvio backend launcher: ") + message + "\r\n";
    DWORD written;
    WriteFile(GetStdHandle(STD_ERROR_HANDLE), line.data(), static_cast<DWORD>(line.size()), &written, nullptr);
}

static std::string platform_string(const std::wstring& value) {
    // The executable manifest opts into UTF-8 on supported Windows versions.
    // JNI VM options use the process's default Windows code page.
    const UINT codepage = GetACP();
    BOOL substituted = FALSE;
    BOOL* substitution = codepage == CP_UTF8 ? nullptr : &substituted;
    const DWORD flags = codepage == CP_UTF8 ? 0 : WC_NO_BEST_FIT_CHARS;
    const int size = WideCharToMultiByte(codepage, flags, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, substitution);
    if (!size || substituted) throw std::runtime_error("JVM option cannot be encoded for this Windows installation");
    std::string result(size, '\0');
    if (!WideCharToMultiByte(codepage, flags, value.data(), static_cast<int>(value.size()), result.data(), size, nullptr, substitution) || substituted)
        throw std::runtime_error("JVM option conversion failed");
    return result;
}

static int launch(const std::vector<std::wstring>& arguments) {
    std::vector<std::string> strings;
    std::wstring main_class;
    for (size_t i = 1; i < arguments.size(); ++i) {
        const auto& argument = arguments[i];
        if (argument == L"-cp") {
            if (++i == arguments.size()) throw std::runtime_error("missing classpath");
            strings.push_back(platform_string(L"-Djava.class.path=" + arguments[i]));
        } else if (argument.rfind(L"-", 0) == 0) {
            strings.push_back(platform_string(argument));
        } else {
            main_class = argument;
            if (i + 1 != arguments.size()) throw std::runtime_error("application arguments are not supported by the backend launcher");
        }
    }
    if (main_class.empty()) throw std::runtime_error("missing backend main class");
    // Used by JVM diagnostics and tooling, just as with the stock launcher.
    strings.push_back(platform_string(L"-Dsun.java.command=" + main_class));
    std::vector<JavaVMOption> options;
    for (auto& value : strings) options.push_back({value.data(), nullptr});

    std::vector<wchar_t> filename(32768);
    const DWORD length = GetModuleFileNameW(nullptr, filename.data(), static_cast<DWORD>(filename.size()));
    if (!length || length >= filename.size()) throw std::runtime_error("cannot locate private JVM");
    const auto bin = std::filesystem::path(std::wstring(filename.data(), length)).parent_path();
    // Resolve only our private runtime and Windows system libraries. Neither the
    // working directory nor a system Java installation may supply JVM DLLs.
    if (!SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_DEFAULT_DIRS) || !AddDllDirectory(bin.c_str()))
        throw std::runtime_error("cannot configure private JVM library search");
    const auto server = bin / L"server";
    if (!AddDllDirectory(server.c_str())) throw std::runtime_error("cannot configure JVM server library search");
    HMODULE library = LoadLibraryExW((server / L"jvm.dll").c_str(), nullptr,
        LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
    if (!library) throw std::runtime_error("cannot load bundled runtime/bin/server/jvm.dll");
    const auto create_vm = reinterpret_cast<jint (JNICALL *)(JavaVM**, void**, void*)>(GetProcAddress(library, "JNI_CreateJavaVM"));
    if (!create_vm) throw std::runtime_error("bundled JVM has no invocation API");
    JavaVMInitArgs init{};
    init.version = JNI_VERSION_1_8;
    init.nOptions = static_cast<jint>(options.size());
    init.options = options.data();
    init.ignoreUnrecognized = JNI_FALSE;
    JavaVM* vm = nullptr;
    JNIEnv* env = nullptr;
    if (create_vm(&vm, reinterpret_cast<void**>(&env), &init) != JNI_OK)
        throw std::runtime_error("JVM initialization failed");

    // Class names here are ASCII; Java paths and properties were passed above.
    std::string class_name = platform_string(main_class);
    for (char& c : class_name) if (c == '.') c = '/';
    jclass entry = env->FindClass(class_name.c_str());
    jmethodID main = entry ? env->GetStaticMethodID(entry, "main", "([Ljava/lang/String;)V") : nullptr;
    if (main) {
        jclass string_class = env->FindClass("java/lang/String");
        if (string_class) {
            jobjectArray args = env->NewObjectArray(0, string_class, nullptr);
            if (args) env->CallStaticVoidMethod(entry, main, args);
        }
    }
    const bool failed = env->ExceptionCheck() || !main;
    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
    }
    // Like java.exe, wait for non-daemon threads after main returns, and run
    // shutdown hooks. System.exit's exit status propagates directly to Windows.
    vm->DestroyJavaVM();
    return failed ? 1 : 0;
}

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
    int count = 0;
    LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &count);
    if (!argv) { diagnostic("cannot read command line"); return 1; }
    const std::vector<std::wstring> arguments(argv, argv + count);
    LocalFree(argv);
    int status = 1;
    try {
        // JNI recommends creating the VM on a dedicated thread rather than the
        // primordial Windows thread. Keep the GUI entry point console-free.
        std::thread worker([&] {
            try { status = launch(arguments); }
            catch (const std::exception& error) { diagnostic(error.what()); }
        });
        worker.join();
    } catch (const std::exception& error) { diagnostic(error.what()); }
    return status;
}
