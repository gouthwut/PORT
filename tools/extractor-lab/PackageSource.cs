#if UPSTREAM
using LibOrbisPkg.PKG;
using System.Security.Cryptography;

namespace Port.ExtractorLab;
internal sealed class PackageSource : IDisposable
{
    private readonly FileStream input;
    private readonly Pkg pkg;
    private readonly List<MetaEntry> metadata = new();
    private readonly byte[] ekpfs;
    public long Length => input.Length;
    public PackageSource(string path)
    {
        if(!Path.IsPathFullyQualified(path)) throw new InvalidDataException("Absolute PKG path required");
        for(var p=new FileInfo(path) as FileSystemInfo;p!=null;p=p is FileInfo f?f.Directory:((DirectoryInfo)p).Parent)
            if((p.Attributes & FileAttributes.ReparsePoint)!=0) throw new IOException("PKG path contains reparse point");
        input=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read);
        try
        {
            if(input.Length<0x5a0 || input.Length>64L<<30) throw new InvalidDataException("PKG size limit");
            var header=new PkgReader(input).ReadHeader();
            if(header.package_size!=(ulong)input.Length || header.entry_count is 0 or > 4096 || header.entry_table_offset<0x5a0 || (ulong)header.entry_table_offset+header.entry_count*32UL>(ulong)input.Length)
                throw new InvalidDataException("PKG metadata bounds");
            if(!header.content_id.StartsWith("EP9000-CUSA03173_",StringComparison.Ordinal) || header.content_type!=ContentType.GD || ((uint)header.content_flags & 0x60100000)!=0)
                throw new InvalidDataException("Only CUSA03173 base game; update/delta application is not implemented");
            input.Position=header.entry_table_offset;
            var ids=new HashSet<EntryId>();
            for(int i=0;i<header.entry_count;i++)
            {
                var e=MetaEntry.Read(input);
                if(!ids.Add(e.id) || (ulong)e.DataOffset+e.DataSize>(ulong)input.Length) throw new InvalidDataException("PKG entry range/duplicate");
                metadata.Add(e);
            }
            var keys=metadata.Single(e=>e.id==EntryId.ENTRY_KEYS); var image=metadata.Single(e=>e.id==EntryId.IMAGE_KEY);
            if(keys.DataSize!=2048 || image.DataSize!=256) throw new InvalidDataException("PKG fixed metadata sizes");
            var entryKeys=KeysEntry.Read(keys,input); input.Position=image.DataOffset; var bytes=new byte[256]; input.ReadExactly(bytes);
            pkg=new Pkg {Header=header,EntryKeys=entryKeys,ImageKey=new GenericEntry(EntryId.IMAGE_KEY) {meta=image,FileData=bytes}};
            ekpfs=pkg.GetEkpfs();
            if(ekpfs is not {Length:32}) throw new InvalidDataException("Documented fake-PKG mechanism unavailable; no passcode or alternate keys tried");
        }
        catch { input.Dispose(); throw; }
    }
    public List<Entry> Plan(CancellationToken token)
    {
        var slice=new FileSlice(input,checked((long)pkg.Header.pfs_image_offset),checked((long)pkg.Header.pfs_image_size),token);
        var outer=new SafePfs(slice,pkg.Header.pfs_flags,ekpfs).Files();
        var inner=new SafePfs(new SafePfsc(outer.Single(e=>e.Path=="/uroot/pfs_image.dat").Data)).Files();
        var plan=inner.Select(e=>new Entry(e.Path,e.Data.Length,()=>new ReadStream(e.Data))).ToList();
        var paths=new HashSet<string>(plan.Select(e=>e.Name),StringComparer.OrdinalIgnoreCase);
        long total=0;
        // Only game-facing sce_sys metadata/assets. Console entitlement/key/bookkeeping
        // entries below PARAM_SFO are deliberately neither decoded nor installed.
        foreach(var e in metadata.Where(e=>(uint)e.id>=0x1000 && EntryNames.IdToName.ContainsKey(e.id)))
        {
            token.ThrowIfCancellationRequested();
            var name="/uroot/sce_sys/"+EntryNames.IdToName[e.id]; Boundary.Relative(name,32);
            if(paths.Contains(name)) continue; // Match upstream extraction order: inner PFS wins.
            total=checked(total+e.DataSize);
            if(e.DataSize>32*1024*1024 || total>128L<<20) throw new InvalidDataException("Supplementary metadata quota");
            Bounded data=new FileSlice(input,e.DataOffset,e.DataSize,token);
            if(e.Encrypted)
            {
                if(e.KeyIndex!=3 || e.DataSize%16!=0) throw new InvalidDataException("Unsupported supplementary metadata mechanism: "+name);
                data=new MetadataBytes(LibOrbisPkg.PKG.Entry.Decrypt(data.Bytes(0,checked((int)e.DataSize)),pkg,e),token);
            }
            paths.Add(name); plan.Add(new Entry(name,e.DataSize,()=>new ReadStream(data)));
        }
        if(!paths.Contains("/uroot/sce_sys/param.sfo") || !paths.Contains("/uroot/eboot.bin")) throw new InvalidDataException("Incomplete base PKG");
        return plan;
    }
    public void Dispose() { CryptographicOperations.ZeroMemory(ekpfs); input.Dispose(); }
    private sealed class MetadataBytes : Bounded {
        private readonly byte[] bytes;
        public MetadataBytes(byte[] bytes,CancellationToken token) {this.bytes=bytes;Length=bytes.Length;Token=token;}
        protected override void ReadCore(long pos,byte[] b,int offset,int count)=>Buffer.BlockCopy(bytes,(int)pos,b,offset,count);
    }
    private sealed class ReadStream(Bounded data) : Stream
    {
        private long position;
        public override int Read(byte[] buffer,int offset,int count)
        { var n=(int)Math.Min(count,data.Length-position); if(n>0) data.Read(position,buffer,offset,n); position+=n; return n; }
        public override long Length=>data.Length;
        public override long Position {get=>position;set=>throw new NotSupportedException();}
        public override bool CanRead=>true;
        public override bool CanSeek=>false;
        public override bool CanWrite=>false;
        public override void Flush()=>throw new NotSupportedException();
        public override long Seek(long o,SeekOrigin s)=>throw new NotSupportedException();
        public override void SetLength(long v)=>throw new NotSupportedException();
        public override void Write(byte[] b,int o,int n)=>throw new NotSupportedException();
    }
}
#endif
