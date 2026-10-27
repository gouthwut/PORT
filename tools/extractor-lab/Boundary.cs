// Original PORT research code. This is a write boundary, not a PKG decoder.
using System.Security.AccessControl;
using System.Security.Principal;

namespace Port.ExtractorLab;

public sealed record Entry(string Name, long Size, Func<Stream> Open);
public sealed record Limits(long Total = 64L << 30, long File = 16L << 30,
    int Count = 100_000, int Depth = 32, long Reserve = 512L << 20, int Ratio = 500);

public static class Boundary
{
    public static string Relative(string name, int depth)
    {
        // PfsReader yields /uroot/... . Only this exact virtual-root prefix is accepted.
        if (!name.StartsWith("/uroot/", StringComparison.Ordinal))
            throw new InvalidDataException("Expected /uroot/ virtual root");
        var relative = name[1..];
        var parts = relative.Split('/');
        if (relative.Length > 220 || parts.Length > depth || parts.Any(p =>
            p.Length == 0 || p is "." or ".." || p.EndsWith('.') || p.EndsWith(' ') ||
            p.Any(c => c < 32 || c > 126 || "<>:\\\"|?*".Contains(c)) ||
            Reserved(p.Split('.')[0])))
            throw new InvalidDataException("Unsafe Windows path");
        return relative.Replace('/', Path.DirectorySeparatorChar);
    }

    private static bool Reserved(string stem) => stem.ToUpperInvariant() is
        "CON" or "PRN" or "AUX" or "NUL" or "CONIN$" or "CONOUT$" or
        "COM1" or "COM2" or "COM3" or "COM4" or "COM5" or "COM6" or "COM7" or "COM8" or "COM9" or
        "LPT1" or "LPT2" or "LPT3" or "LPT4" or "LPT5" or "LPT6" or "LPT7" or "LPT8" or "LPT9";

    public static void NoLinks(string path)
    {
        for (var current = new DirectoryInfo(Path.GetFullPath(path)); current != null; current = current.Parent)
        {
            // Attributes also detects junctions and dangling reparse links.
            if ((current.Attributes & FileAttributes.ReparsePoint) != 0 || current.LinkTarget != null)
                throw new IOException("Reparse point / symbolic link is forbidden");
        }
    }

    public static long Extract(IEnumerable<Entry> entries, string destination, long sourceBytes,
        Limits limits, CancellationToken token, Action<long, long>? progress = null)
    {
        if (!Path.IsPathFullyQualified(destination) || limits.Total < 0 || limits.File < 0 ||
            limits.Reserve < 0 || limits.Count <= 0 || limits.Depth <= 0 || limits.Ratio <= 0 || sourceBytes <= 0)
            throw new ArgumentException("Invalid extraction limits or destination");
        var target = Path.GetFullPath(destination);
        if (Directory.Exists(target) || System.IO.File.Exists(target))
            throw new IOException("Destination must not exist");
        var parent = Path.GetDirectoryName(target) ?? throw new IOException("Missing parent");
        if (!Directory.Exists(parent)) throw new IOException("Parent must exist");
        NoLinks(parent);
        var plan = new List<(Entry Entry, string Path)>();
        var files = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var directories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        long total = 0;
        foreach (var entry in entries)
        {
            token.ThrowIfCancellationRequested();
            if (plan.Count >= limits.Count || entry.Size < 0 || entry.Size > limits.File)
                throw new InvalidDataException("File count / size quota exceeded");
            var relative = Relative(entry.Name, limits.Depth);
            total = checked(total + entry.Size);
            if (total > limits.Total || total > checked(sourceBytes * limits.Ratio + (1L << 20)))
                throw new InvalidDataException("Expanded-size / ratio quota exceeded");
            if (!files.Add(relative) || directories.Contains(relative))
                throw new InvalidDataException("Case collision or duplicate path");
            for (var d = Path.GetDirectoryName(relative); !string.IsNullOrEmpty(d); d = Path.GetDirectoryName(d))
            {
                if (files.Contains(d)) throw new InvalidDataException("File/directory collision");
                directories.Add(d);
            }
            plan.Add((entry, relative));
        }
        if (plan.Count == 0) throw new InvalidDataException("Empty extraction plan");
        if (new DriveInfo(Path.GetPathRoot(parent)!).AvailableFreeSpace < checked(total + limits.Reserve))
            throw new IOException("Not enough free space, including reserve");
        token.ThrowIfCancellationRequested();
        // Random sibling staging permits one same-volume final rename without overwrites.
        var staging = Path.Combine(parent, ".port-extract-" + Guid.NewGuid().ToString("N"));
        bool created = false;
        try
        {
            // Windows: protected owner-only ACL, no inherited write access for other users.
            if (OperatingSystem.IsWindows())
            {
                var acl = new DirectorySecurity();
                var owner = WindowsIdentity.GetCurrent().User!;
                acl.SetOwner(owner);
                acl.SetAccessRuleProtection(true, false);
                acl.AddAccessRule(new FileSystemAccessRule(owner, FileSystemRights.FullControl,
                    InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                    PropagationFlags.None, AccessControlType.Allow));
                FileSystemAclExtensions.CreateDirectory(acl, staging);
            }
            else
            {
                Directory.CreateDirectory(staging, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            }
            created = true;
            long written = 0;
            var buffer = new byte[65536];
            foreach (var (entry, relative) in plan)
            {
                token.ThrowIfCancellationRequested();
                NoLinks(staging);
                var path = Path.GetFullPath(Path.Combine(staging, relative));
                if (!path.StartsWith(staging + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("Path escaped staging");
                var dir = Path.GetDirectoryName(path)!;
                Directory.CreateDirectory(dir);
                NoLinks(dir);
                using var input = entry.Open();
                using var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
                long remaining = entry.Size;
                while (remaining > 0)
                {
                    token.ThrowIfCancellationRequested();
                    var n = input.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining));
                    if (n == 0) throw new EndOfStreamException("Truncated entry");
                    output.Write(buffer, 0, n);
                    remaining -= n;
                    written = checked(written + n);
                    progress?.Invoke(written, total);
                }
                if (input.ReadByte() != -1) throw new InvalidDataException("Entry exceeds declared size");
                output.Flush(true);
            }
            token.ThrowIfCancellationRequested();
            NoLinks(parent);
            Directory.Move(staging, target); // fails if destination already exists
            created = false;
            return written;
        }
        finally
        {
            if (created) DeleteOwnedTree(staging);
        }
    }

    private static void DeleteOwnedTree(string path)
    {
        // Refuse to follow a link even during error cleanup.
        NoLinks(path);
        foreach (var item in new DirectoryInfo(path).EnumerateFileSystemInfos())
        {
            if ((item.Attributes & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Refusing cleanup through a reparse point");
            if (item is DirectoryInfo) DeleteOwnedTree(item.FullName);
            else item.Delete();
        }
        Directory.Delete(path);
    }
}
