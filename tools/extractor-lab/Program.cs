using System.Text;
using Port.ExtractorLab;

#if UPSTREAM
if (args.Length == 2 && args[0] is "--probe-mechanism" or "--probe-tree")
{
    PackageProbe.Run(args[1], args[0] == "--probe-tree");
    return;
}
#endif
if (args.Length != 1 || args[0] != "--self-test")
    throw new ArgumentException("Research harness accepts only --self-test; no user-PKG extraction command.");
var root = Directory.CreateTempSubdirectory("port-boundary-tests-").FullName;
int passed = 0;
try
{
    var limits = new Limits(Total: 1 << 20, File: 1 << 20, Count: 10, Reserve: 0);
    Entry EntryOf(string name, string text = "fixture") =>
        new(name, Encoding.UTF8.GetByteCount(text), () => new MemoryStream(Encoding.UTF8.GetBytes(text)));
    void Test(string name, Action action)
    {
        action();
        Console.WriteLine("PASS " + name);
        passed++;
    }
    void Rejected(string name, IEnumerable<Entry> entries, Limits? quota = null,
        CancellationToken token = default, Action<long, long>? progress = null)
    {
        var target = Path.Combine(root, Guid.NewGuid().ToString("N"));
        Test(name, () =>
        {
            bool rejected = false;
            try { Boundary.Extract(entries, target, 1 << 20, quota ?? limits, token, progress); }
            catch (Exception e) when (e is IOException or InvalidDataException or ArgumentException or OperationCanceledException or OverflowException)
            { rejected = true; }
            if (!rejected || Directory.Exists(target) || Directory.GetDirectories(root, ".port-extract-*").Length != 0)
                throw new Exception("Rejection / atomic cleanup failed: " + name);
        });
    }
    Test("stream bytes, atomic finalization and refusal to overwrite", () =>
    {
        var target = Path.Combine(root, "success");
        var written = Boundary.Extract([EntryOf("/uroot/sce_sys/fixture.txt")], target, 10, limits, default);
        if (written != 7 || File.ReadAllText(Path.Combine(target, "uroot/sce_sys/fixture.txt")) != "fixture")
            throw new Exception("Incorrect output");
        try { Boundary.Extract([EntryOf("/uroot/sce_sys/fixture.txt", "changed")], target, 10, limits, default); }
        catch (IOException) { return; }
        throw new Exception("Overwrote destination");
    });
    foreach (var path in new[] { "/uroot/../escape", "/uroot/a/../../escape", "/uroot/C:/escape", "/uroot/a:b",
        "/uroot/a\\..\\escape", "/uroot//x", "/uroot/CON.txt", "/uroot/NUL", "/uroot/trailing.",
        "/uroot/trailing ", "/uroot/a\0b", "//host/share", "C:/escape", "/uroot/./x", "/root/file" })
        Rejected("path " + path.Replace('\0', '?'), [EntryOf(path)]);
    Rejected("case collision", [EntryOf("/uroot/A"), EntryOf("/uroot/a")]);
    Rejected("file/directory conflict", [EntryOf("/uroot/a"), EntryOf("/uroot/a/b")]);
    Rejected("reverse file/directory conflict", [EntryOf("/uroot/a/b"), EntryOf("/uroot/a")]);
    Rejected("truncated stream", [new Entry("/uroot/a", 8, () => new MemoryStream([1]))]);
    Rejected("oversized stream", [new Entry("/uroot/a", 1, () => new MemoryStream([1, 2]))]);
    Rejected("negative size", [new Entry("/uroot/a", -1, () => Stream.Null)]);
    Rejected("per-file quota", [EntryOf("/uroot/a")], limits with { File = 1 });
    Rejected("total quota", [EntryOf("/uroot/a"), EntryOf("/uroot/b")], limits with { Total = 10 });
    Rejected("file-count quota", [EntryOf("/uroot/a"), EntryOf("/uroot/b")], limits with { Count = 1 });
    Rejected("depth quota", [EntryOf("/uroot/a/b")], limits with { Depth = 2 });
    Rejected("free-space reserve", [EntryOf("/uroot/a")], limits with { Reserve = long.MaxValue - 10 });
    Rejected("bomb ratio", [new Entry("/uroot/a", 3L << 20, () => Stream.Null)],
        limits with { Total = 4 << 20, File = 4 << 20, Ratio = 1 });
    using var cancelled = new CancellationTokenSource();
    cancelled.Cancel();
    Rejected("cancel before writes", [EntryOf("/uroot/a")], token: cancelled.Token);
    using var mid = new CancellationTokenSource();
    Rejected("cancel mid-stream", [EntryOf("/uroot/a", new string('a', 200_000))],
        token: mid.Token, progress: (_, _) => mid.Cancel());
    Rejected("decoder failure cleanup", [EntryOf("/uroot/a"), new Entry("/uroot/b", 1,
        () => throw new InvalidDataException("synthetic decoder failure"))]);
    if (OperatingSystem.IsWindows())
    {
        var junction = Path.Combine(root, "junction");
        var outside = Path.Combine(root, "outside");
        Directory.CreateDirectory(outside);
        var p = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("cmd.exe")
        { Arguments = $"/c mklink /J \"{junction}\" \"{outside}\"", CreateNoWindow = true,
            UseShellExecute = false, RedirectStandardOutput = true })!;
        p.WaitForExit();
        if (p.ExitCode != 0) throw new Exception("Could not create test junction");
        Test("junction ancestor rejected", () =>
        {
            try { Boundary.Extract([EntryOf("/uroot/a")], Path.Combine(junction, "out"), 100, limits, default); }
            catch (IOException) { Directory.Delete(junction); return; }
            throw new Exception("Followed junction");
        });
    }
    Test("retry after failure", () =>
    {
        var target = Path.Combine(root, "retry");
        Boundary.Extract([EntryOf("/uroot/a")], target, 100, limits, default);
        if (!File.Exists(Path.Combine(target, "uroot/a"))) throw new Exception("Retry failed");
    });
#if UPSTREAM
    UpstreamBridge.SyntheticTests(root);
#endif
    Console.WriteLine($"Write-boundary tests: {passed} passed. No game data or keys used.");
}
finally
{
    Directory.Delete(root, true);
}
