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
        SafeReaderTests(good);
    }
    sealed class BytesView(byte[] bytes) : Bounded {
        public BytesView(byte[] bytes, CancellationToken token) : this(bytes) { Token=token; }
        protected override void ReadCore(long pos,byte[] buffer,int offset,int count) => Buffer.BlockCopy(bytes,(int)pos,buffer,offset,count);
        public void SetLength() => Length=bytes.Length;
    }
    static void SafeReaderTests(byte[] good)
    {
        BytesView View(byte[] b) { var v=new BytesView(b); v.SetLength(); return v; }
        var files=new SafePfs(View(good)).Files();
        if(files.Count!=1 || !files[0].Data.Bytes(0,3).SequenceEqual(new byte[]{1,2,3})) throw new Exception("Safe PFS roundtrip");
        var tests=new List<byte[]> {good[..64],new byte[good.Length],Fixture("../escape.txt")};
        var huge=good.ToArray(); BinaryPrimitives.WriteInt64LittleEndian(huge.AsSpan(0x30),long.MaxValue); tests.Add(huge);
        var block=good.ToArray(); BinaryPrimitives.WriteUInt32LittleEndian(block.AsSpan(0x20),uint.MaxValue); tests.Add(block);
        var range=good.ToArray(); BinaryPrimitives.WriteInt64LittleEndian(range.AsSpan(0x40),long.MaxValue); tests.Add(range);
        var encrypted=good.ToArray(); encrypted[0x1c]|=4; tests.Add(encrypted);
        // Corrupt a directory edge to point back to the root; no recursive traversal is used.
        using(var source=new MemoryStream(good,false)) {
            source.Position=65536;var inode=DinodeD32.ReadFromStream(source);
            var start=inode.StartBlock*65536;
            for(int offset=start;offset+16<=good.Length;) {
                var size=BinaryPrimitives.ReadInt32LittleEndian(good.AsSpan(offset+12));
                if(size==0)break;
                if(BinaryPrimitives.ReadInt32LittleEndian(good.AsSpan(offset+4))==3) {
                    var cycle=good.ToArray();BinaryPrimitives.WriteUInt32LittleEndian(cycle.AsSpan(offset),0);tests.Add(cycle);
                    var length=good.ToArray();BinaryPrimitives.WriteInt32LittleEndian(length.AsSpan(offset+8),int.MaxValue);tests.Add(length);break;
                }
                offset+=size;
            }
        }
        foreach(var b in tests) {
            bool rejected=false; try {new SafePfs(View(b)).Files();} catch(Exception e) when(e is IOException or InvalidDataException or ArgumentException or OverflowException) {rejected=true;}
            if(!rejected) throw new Exception("Unsafe PFS fixture accepted");
        }
        for(int i=0;i<300;i++) {
            var b=good.ToArray(); var random=new Random(i); var start=random.Next(0,Math.Min(b.Length,0x400)); random.NextBytes(b.AsSpan(start,Math.Min(32,b.Length-start)));
            try {new SafePfs(View(b)).Files();} catch(Exception e) when(e is IOException or InvalidDataException or ArgumentException or OverflowException) { }
        }
        var input=new byte[131072]; new Random(1).NextBytes(input);
        var key=Enumerable.Range(0,16).Select(i=>(byte)i).ToArray(); var tweak=key.Reverse().ToArray();
        using var reference=new XtsDecryptReader(View(input),key,tweak);
        using var actual=new SafeXts(View(input),key,tweak);
        foreach(var (offset,count) in new[]{(0L,10),(65536L,65536),(65530L,40),(70001L,7777)}) {
            var a=new byte[count]; reference.Read(offset,a,0,count);
            if(!a.SequenceEqual(actual.Bytes(offset,count))) throw new Exception("XTS differs from pinned upstream");
        }
        var pfsc=new byte[56+65536];
        BinaryPrimitives.WriteUInt32LittleEndian(pfsc,0x43534650);
        BinaryPrimitives.WriteInt32LittleEndian(pfsc.AsSpan(12),65536);
        BinaryPrimitives.WriteInt64LittleEndian(pfsc.AsSpan(16),65536);
        BinaryPrimitives.WriteInt64LittleEndian(pfsc.AsSpan(24),48);
        BinaryPrimitives.WriteInt64LittleEndian(pfsc.AsSpan(32),64);
        BinaryPrimitives.WriteInt64LittleEndian(pfsc.AsSpan(40),65536);
        Array.Resize(ref pfsc,64+65536);
        BinaryPrimitives.WriteInt64LittleEndian(pfsc.AsSpan(48),64);
        BinaryPrimitives.WriteInt64LittleEndian(pfsc.AsSpan(56),64+65536);
        new SafePfsc(View(pfsc)).Bytes(0,65536);
        foreach(var position in new[]{12,16,24,40,48,56}) {
            var b=pfsc.ToArray(); b.AsSpan(position,4).Fill(255);
            bool rejected=false;try {new SafePfsc(View(b)).Bytes(0,65536);} catch(Exception e) when(e is IOException or InvalidDataException or ArgumentException or OverflowException) {rejected=true;}
            if(!rejected) throw new Exception("Unsafe PFSC fixture accepted");
        }
        // Valid zlib sector, then a decompression bomb and truncated output.
        byte[] Compressed(int length) {
            using var output=new MemoryStream();using(var z=new System.IO.Compression.ZLibStream(output,System.IO.Compression.CompressionLevel.SmallestSize,true)) z.Write(new byte[length]);
            var packed=output.ToArray();var b=pfsc[..64].Concat(packed).ToArray();BinaryPrimitives.WriteInt64LittleEndian(b.AsSpan(56),b.Length);return b;
        }
        new SafePfsc(View(Compressed(65536))).Bytes(0,65536);
        foreach(var length in new[]{1,131072}) {bool rejected=false;try{new SafePfsc(View(Compressed(length))).Bytes(0,65536);}catch(Exception e)when(e is IOException or InvalidDataException){rejected=true;}if(!rejected)throw new Exception("PFSC expansion quota not enforced");}
        using var cancelled=new CancellationTokenSource();cancelled.Cancel();var cancelledView=new BytesView(good,cancelled.Token);cancelledView.SetLength();
        try {new SafePfs(cancelledView);throw new Exception("Cancelled reader ran");}catch(OperationCanceledException){}
        Console.WriteLine("PASS bounded PFS roundtrip + hostile header/dirent/cycle fixtures + 300 mutations + 4 XTS comparisons + PFSC maps/zlib/expansion/truncation + cancellation");
    }
}
#endif
