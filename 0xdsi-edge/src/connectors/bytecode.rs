use crate::define_connector;

/// Bytecode Instrumentation Connectors
/// These inject monitoring hooks into running application runtimes
/// to capture function calls, string operations, and memory access patterns.

// JVM: AspectJ load-time weaving via javaagent
define_connector!(BytecodeJvm, "JVM Bytecode Weaving (AspectJ)", "bytecode_jvm", "instrumentation",
    "AspectJ LTW / javaagent / JVM TI");

// .NET CLR: Profiling API hooks
define_connector!(BytecodeDotnet, "CLR Profiler API (.NET)", "bytecode_dotnet", "instrumentation",
    "ICorProfilerCallback / CLR Profiler API");

// Python: sys.settrace + importlib hooks
define_connector!(BytecodePython, "Python sys.settrace", "bytecode_python", "instrumentation",
    "sys.settrace / sys.setprofile / importlib");

// eBPF: Kernel-level syscall tracing
define_connector!(BytecodeEbpf, "eBPF Kernel Probe", "bytecode_ebpf", "instrumentation",
    "kprobe / uprobe / tracepoint / eBPF ringbuf");

// Node.js: Module shimming and async_hooks
define_connector!(BytecodeNodejs, "Node.js Module Shimming", "bytecode_nodejs", "instrumentation",
    "require() hook / ESM loader / async_hooks");
