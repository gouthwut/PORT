// Original, synthetic Windows setup fixture. No game data, downloads or registry writes.
using System;
using System.IO;
using System.Diagnostics;
using System.Threading;
class RecipeSetupFixture {
    static int Main(string[] args) {
        string runtime = Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName);
        string stage = Path.GetDirectoryName(runtime);
        if (File.ReadAllText(Path.Combine(stage, "game", "data", "main.bin")) != "base" ||
            File.ReadAllText(Path.Combine(stage, "game", "tu", "patch.bin")) != "prepared") return 7;
        Directory.CreateDirectory(Path.Combine(stage, "user-data"));
        File.WriteAllText(Path.Combine(stage, "user-data", "save"), "synthetic progress");
        File.WriteAllText(Path.Combine(runtime, "fixture-started"), "started");
        if (Array.IndexOf(args, "--wait") >= 0) Thread.Sleep(60000);
        if (Array.IndexOf(args, "--fail") >= 0) return 3;
        if (Array.IndexOf(args, "--no-output") >= 0) return 0;
        File.WriteAllText(Path.Combine(runtime, "output.bin"), "output");
        return 0;
    }
}
