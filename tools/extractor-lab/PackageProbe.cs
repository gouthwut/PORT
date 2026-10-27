#if UPSTREAM
using LibOrbisPkg.PKG;
using System.Security.Cryptography;
using System.Text.Json;

namespace Port.ExtractorLab;

// Bounded, read-only compatibility diagnostic. No PFS/PFSC traversal, file extraction,
// passcode attempts, user keys, payload decryption or output of key material.
internal static class PackageProbe
{
    public static void Run(string path, bool tree = false)
    {
        if (!Path.IsPathFullyQualified(path)) throw new ArgumentException("Absolute path required");
        for (var p = new FileInfo(path) as FileSystemInfo; p != null; p = p is FileInfo f ? f.Directory : ((DirectoryInfo)p).Parent)
            if ((p.Attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("Reparse point");
        using var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (input.Length < 0x5a0) throw new InvalidDataException("Truncated header");
        var reader = new PkgReader(input);
        var header = reader.ReadHeader();
        if (header.package_size != (ulong)input.Length || header.entry_count is 0 or > 4096 ||
            header.entry_table_offset < 0x5a0 || (ulong)header.entry_table_offset + header.entry_count * 32UL > (ulong)input.Length)
            throw new InvalidDataException("Invalid header/table ranges");
        var entries = new List<MetaEntry>();
        input.Position = header.entry_table_offset;
        for (var i = 0; i < header.entry_count; i++) entries.Add(MetaEntry.Read(input));
        var keyMeta = entries.Single(e => e.id == EntryId.ENTRY_KEYS);
        var imageMeta = entries.Single(e => e.id == EntryId.IMAGE_KEY);
        if (keyMeta.DataSize != 2048 || imageMeta.DataSize != 256 ||
            (ulong)keyMeta.DataOffset + keyMeta.DataSize > (ulong)input.Length ||
            (ulong)imageMeta.DataOffset + imageMeta.DataSize > (ulong)input.Length)
            throw new InvalidDataException("Invalid fixed-size metadata");
        var keys = KeysEntry.Read(keyMeta, input);
        input.Position = imageMeta.DataOffset;
        var image = new byte[256]; input.ReadExactly(image);
        var pkg = new Pkg { Header = header, EntryKeys = keys, ImageKey = new GenericEntry(EntryId.IMAGE_KEY) { meta = imageMeta, FileData = image } };
        // The upstream's documented fake-PKG-only mechanism. No alternative keys/codes are tried.
        var result = pkg.GetEkpfs();
        var available = result is { Length: 32 };
        object? treeResult = null;
        if (tree && available)
        {
            using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(2));
            var source = new FileSlice(input, checked((long)header.pfs_image_offset), checked((long)header.pfs_image_size), deadline.Token);
            var outer = new SafePfs(source, header.pfs_flags, result);
            var outerFiles = outer.Files();
            var compressed = outerFiles.Single(e => e.Path == "/uroot/pfs_image.dat").Data;
            var pfsc = new SafePfsc(compressed);
            var inner = new SafePfs(pfsc);
            var files = inner.Files();
            treeResult = new { files = files.Count, bytes = files.Sum(e => e.Data.Length), eboot = files.Any(e => e.Path == "/uroot/eboot.bin"), paths = files.Take(4).Select(e => e.Path).ToArray() };
        }
        if (result != null) CryptographicOperations.ZeroMemory(result);
        input.Position = 0;
        var boundedHeader = new byte[0x5a0]; input.ReadExactly(boundedHeader);
        Console.WriteLine(JsonSerializer.Serialize(new {
            file = Path.GetFileName(path), bytes = input.Length,
            headerSha256 = Convert.ToHexString(SHA256.HashData(boundedHeader)).ToLowerInvariant(),
            mechanism = "LibOrbisPkg Pkg.GetEkpfs (fake-PKG only), pinned source 4f9426e7",
            mechanismAvailable = available,
            payloadDecoded = tree, treeResult, passcodesTried = 0,
            conclusion = available ? "Fake-PKG mechanism returned expected material; safe decoder remains a separate gate." : "Documented fake-PKG mechanism did not succeed. Does not prove universal undecryptability or authenticate retail/fake status."
        }));
    }
}
#endif
