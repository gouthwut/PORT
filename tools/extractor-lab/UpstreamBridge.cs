#if UPSTREAM
using System.Buffers.Binary;
using LibOrbisPkg.PFS;
using LibOrbisPkg.Util;

namespace Port.ExtractorLab;

// Connects the existing decoder to the replacement writer using tiny generated PFS fixtures.
// Intentionally has no user-file CLI, decryption, passcode or key path.
static class UpstreamBridge
{
    sealed class FixtureReader(byte[] bytes) : IMemoryReader
    {
        public void Read(long pos, byte[] buffer, int offset, int count)
        {
            if (pos < 0 || count < 0 || pos > bytes.LongLength - count)
                throw new EndOfStreamException("PFS read outside fixture");
            Buffer.BlockCopy(bytes, checked((int)pos), buffer, offset, count);
        }
        public void Dispose() { }
    }
    sealed class EntryStream(PfsReader.File file) : Stream
    {
        readonly IMemoryReader view = file.GetView();
        long position;
        public override int Read(byte[] buffer, int offset, int count)
        {
            var n = checked((int)Math.Min(count, file.size - position));
            if (n > 0) view.Read(position, buffer, offset, n);
            position += n;
            return n;
        }
        protected override void Dispose(bool disposing) { if (disposing) view.Dispose(); base.Dispose(disposing); }
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => file.size;
        public override long Position { get => position; set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
    static PfsReader DecodeFixture(byte[] bytes)
    {
        if (bytes.Length is < 0x400 or > 8 * 1024 * 1024)
            throw new InvalidDataException("Synthetic fixture bounds");
        var mode = BinaryPrimitives.ReadUInt16LittleEndian(bytes.AsSpan(0x1c));
        var block = BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(0x20));
        var count = BinaryPrimitives.ReadInt64LittleEndian(bytes.AsSpan(0x30));
        var blocks = BinaryPrimitives.ReadInt64LittleEndian(bytes.AsSpan(0x40));
        if ((mode & 4) != 0) throw new InvalidDataException("Encrypted PFS: no decryption path");
        if (block != 65536 || count is <= 0 or > 1000 || blocks is <= 0 or > 100 ||
            checked((blocks + 1) * block) > bytes.Length)
            throw new InvalidDataException("PFS allocation / range limits");
        return new PfsReader(new FixtureReader(bytes));
    }
    static byte[] Fixture(string name)
    {
        var root = new FSDir();
        root.Files.Add(new FSFile(s => s.Write(new byte[] { 1, 2, 3 }), name, 3) { Parent = root });
        var builder = new PfsBuilder(new PfsProperties { root = root, BlockSize = 65536 });
        using var stream = new MemoryStream();
        builder.WriteImage(stream);
        return stream.ToArray();
    }
    public static void SyntheticTests(string root)
    {
        void Extract(byte[] bytes, string target)
        {
            var decoder = DecodeFixture(bytes);
            var entries = decoder.GetAllFiles().Select(f =>
                new Entry(f.FullName, f.size, () => new EntryStream(f)));
            Boundary.Extract(entries, target, bytes.Length, new Limits(Reserve: 0), default);
        }
        var good = Fixture("fixture.txt");
        Extract(good, Path.Combine(root, "pfs-success"));
        if (!System.IO.File.ReadAllBytes(Path.Combine(root, "pfs-success/uroot/fixture.txt")).SequenceEqual(new byte[] { 1, 2, 3 }))
            throw new Exception("PFS roundtrip failed");
        Console.WriteLine("PASS pinned upstream PfsBuilder → PfsReader → bounded writer roundtrip");
        var corruptions = new List<byte[]> { good[..0x80], new byte[good.Length] };
        var huge = good.ToArray();
        BinaryPrimitives.WriteInt64LittleEndian(huge.AsSpan(0x30), long.MaxValue);
        corruptions.Add(huge);
        var encrypted = good.ToArray();
        encrypted[0x1c] |= 4;
        corruptions.Add(encrypted);
        // Traversal is deliberately encoded by the upstream builder, then rejected by our writer.
        corruptions.Add(Fixture("../escape.txt"));
        foreach (var bytes in corruptions)
        {
            bool rejected = false;
            var target = Path.Combine(root, Guid.NewGuid().ToString("N"));
            try { Extract(bytes, target); }
            catch (Exception e) when (e is IOException or InvalidDataException or ArgumentException or OverflowException) { rejected = true; }
            if (!rejected || Directory.Exists(target)) throw new Exception("Unsafe PFS accepted");
        }
        Console.WriteLine("PASS synthetic PFS traversal, truncated structure, invalid magic, oversized count, encrypted-mode rejection");
    }
}
#endif
