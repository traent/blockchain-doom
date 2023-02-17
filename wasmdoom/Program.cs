using Microsoft.ClearScript;
using Microsoft.ClearScript.JavaScript;
using Microsoft.ClearScript.V8;

using var engine = new V8ScriptEngine(
    // V8ScriptEngineFlags.AwaitDebuggerAndPauseOnStart |
    V8ScriptEngineFlags.EnableDebugging |
    V8ScriptEngineFlags.EnableRemoteDebugging
);

var readFile = new Func<string, object>(path =>
{
    var bytes = File.ReadAllBytes(path);
    ScriptObject uint8ArrayClass = engine.Script.Uint8Array;
    var typedArray = (ITypedArray<byte>)uint8ArrayClass.Invoke(true, bytes.Length);
    typedArray.WriteBytes(bytes, 0, Convert.ToUInt64(bytes.Length), 0);
    return typedArray;
});

var readText = new Func<string, object>(path => File.ReadAllText(path));

var saveFile = new Action<string, ITypedArray<byte>>((path, data) =>
{
    File.WriteAllBytes(path, data.GetBytes());
});

var consoleWriteLine = new Action<string>((message) =>
{
    Console.WriteLine(message);
});

engine.AddHostObject("consoleWriteLine", consoleWriteLine);
engine.AddHostObject("readFile", readFile);
engine.AddHostObject("readText", readText);
engine.AddHostObject("saveFile", saveFile);

engine.DocumentSettings.AccessFlags = DocumentAccessFlags.EnableFileLoading;
engine.DocumentSettings.SearchPath = Directory.GetCurrentDirectory();
engine.Evaluate(new DocumentInfo { Category = ModuleCategory.Standard }, "import doom from './websockets-doom.js';");

await Task.Delay(120000);
