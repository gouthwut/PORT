#if UPSTREAM
using System.Buffers.Binary;
using System.IO.Compression;
using System.Security.Cryptography;
using LibOrbisPkg.PFS;
using LibOrbisPkg.Util;

namespace Port.ExtractorLab;

// Original bounded reader for the explicitly supported 64-KiB, 32-bit PFS layout.
// Unsupported layouts fail closed. Upstream's recursive PfsReader/PFSCReader are not used.
internal abstract class Bounded : IMemoryReader
{
    public long Length { get; protected set; }
    public CancellationToken Token { get; init; }
    public void Read(long pos, byte[] buffer, int offset, int count)
    {
        Token.ThrowIfCancellationRequested();
        if (pos < 0 || count < 0 || pos > Length - count || offset < 0 || offset > buffer.Length - count)
            throw new InvalidDataException("Read outside bounded image");
        if (count > 0) ReadCore(pos, buffer, offset, count);
    }
    protected abstract void ReadCore(long pos, byte[] buffer, int offset, int count);
    public byte[] Bytes(long pos, int count) { var b = new byte[count]; Read(pos,b,0,count); return b; }
    public virtual void Dispose() { }
}
internal sealed class FileSlice : Bounded
{
    private readonly FileStream file;
    private readonly long start;
    public FileSlice(FileStream f, long start, long length, CancellationToken token)
    {
        if (start < 0 || length < 0 || start > f.Length - length) throw new InvalidDataException("PKG PFS range");
        file = f; this.start = start; Length = length; Token = token;
    }
    protected override void ReadCore(long pos, byte[] buffer, int offset, int count)
    { file.Position = checked(start + pos); file.ReadExactly(buffer.AsSpan(offset,count)); }
}
internal sealed class Decoded : Bounded
{
    private readonly IMemoryReader reader;
    public Decoded(IMemoryReader reader, long length, CancellationToken token) { this.reader = reader; Length=length; Token=token; }
    protected override void ReadCore(long pos, byte[] buffer, int offset, int count) => reader.Read(pos,buffer,offset,count);
}
internal sealed class BlockFile : Bounded
{
    private readonly Bounded parent;
    private readonly int[] blocks;
    public BlockFile(Bounded parent, int[] blocks, long size) { this.parent=parent; this.blocks=blocks; Length=size; Token=parent.Token; }
    protected override void ReadCore(long pos, byte[] buffer, int offset, int count)
    {
        while (count > 0)
        {
            var i = checked((int)(pos / 65536)); var within = (int)(pos % 65536);
            if (i >= blocks.Length) throw new InvalidDataException("Missing PFS block");
            var n = Math.Min(count,65536-within);
            parent.Read(checked((long)blocks[i]*65536+within),buffer,offset,n);
            pos+=n; offset+=n; count-=n;
        }
    }
}
internal sealed class SafeXts : Bounded
{
    private readonly Bounded source;
    private readonly ICryptoTransform decrypt;
    private readonly ICryptoTransform encryptTweak;
    private readonly byte[] input=new byte[65536], mask=new byte[4096], tweak=new byte[16], counter=new byte[16];
    public SafeXts(Bounded source,byte[] key,byte[] tweakKey)
    {
        this.source=source; Length=source.Length; Token=source.Token;
        using var aes=Aes.Create(); aes.Mode=CipherMode.ECB; aes.Padding=PaddingMode.None;
        decrypt=aes.CreateDecryptor(key,new byte[16]); encryptTweak=aes.CreateEncryptor(tweakKey,new byte[16]);
    }
    protected override void ReadCore(long pos,byte[] buffer,int offset,int count)
    {
        while(count>0)
        {
            Token.ThrowIfCancellationRequested();
            var start=pos/4096*4096; var skip=(int)(pos-start);
            var n=Math.Min(count,input.Length-skip); var aligned=(n+skip+4095)/4096*4096;
            source.Read(start,input,0,aligned);
            for(int s=0;s<aligned;s+=4096)
            {
                var number=(start+s)/4096;
                if(number<16) continue;
                BinaryPrimitives.WriteInt64LittleEndian(counter,number);
                encryptTweak.TransformBlock(counter,0,16,tweak,0);
                for(int b=0;b<4096;b+=16)
                {
                    Buffer.BlockCopy(tweak,0,mask,b,16);
                    int carry=0;
                    for(int k=0;k<16;k++) { var v=tweak[k]; tweak[k]=(byte)((v<<1)|carry); carry=v>>7; }
                    if(carry!=0) tweak[0]^=0x87;
                }
                for(int b=0;b<4096;b++) input[s+b]^=mask[b];
                decrypt.TransformBlock(input,s,4096,input,s);
                for(int b=0;b<4096;b++) input[s+b]^=mask[b];
            }
            Buffer.BlockCopy(input,skip,buffer,offset,n); pos+=n; offset+=n; count-=n;
        }
    }
    public override void Dispose() { decrypt.Dispose(); encryptTweak.Dispose(); CryptographicOperations.ZeroMemory(input); }
}
internal sealed class SafePfsc : Bounded
{
    private readonly Bounded source;
    private readonly long[] map;
    private readonly int block;
    private readonly byte[] sector;
    private int cached = -1;
    public SafePfsc(Bounded source)
    {
        this.source=source; Token=source.Token;
        var h=source.Bytes(0,48);
        if (U32(h,0)!=0x43534650 || U32(h,4)!=0) throw new InvalidDataException("PFSC magic/header");
        block=checked((int)U32(h,12)); Length=I64(h,40);
        var offsets=I64(h,24); var dataStart=I64(h,32);
        if (block is < 4096 or > 65536 || (block & (block-1))!=0 || I64(h,16)!=block || Length<=0 || Length>64L<<30 || Length%block!=0)
            throw new InvalidDataException("PFSC block/expanded-size limits");
        var count=checked((int)(Length/block));
        if (count>1_048_576 || offsets<48 || offsets>source.Length-(count+1L)*8 || dataStart<offsets+(count+1L)*8 || dataStart>source.Length)
            throw new InvalidDataException("PFSC sector-map bounds");
        map=new long[count+1];
        // Fixed small reads keep the map budget <=8 MiB and cancellation responsive.
        var mapBytes=source.Bytes(offsets,checked((count+1)*8));
        for (int i=0;i<map.Length;i++)
        {
            Token.ThrowIfCancellationRequested();
            map[i]=I64(mapBytes,i*8);
            if (map[i]<dataStart || map[i]>source.Length || (i>0 && (map[i]<=map[i-1] || map[i]-map[i-1]>block)))
                throw new InvalidDataException("PFSC non-monotonic/unsupported sector span");
        }
        sector=new byte[block];
    }
    protected override void ReadCore(long pos, byte[] buffer, int offset, int count)
    {
        while(count>0)
        {
            var index=checked((int)(pos/block)); var within=(int)(pos%block);
            if(cached!=index)
            {
                var size=checked((int)(map[index+1]-map[index]));
                if(size==block) source.Read(map[index],sector,0,block);
                else
                {
                    if(size<6) throw new InvalidDataException("PFSC truncated compressed sector");
                    using var input=new MemoryStream(source.Bytes(map[index],size),false);
                    using var z=new ZLibStream(input,CompressionMode.Decompress);
                    z.ReadExactly(sector);
                    if(z.ReadByte()!=-1) throw new InvalidDataException("PFSC expansion exceeds sector");
                }
                cached=index;
            }
            var n=Math.Min(count,block-within); Buffer.BlockCopy(sector,within,buffer,offset,n);
            pos+=n; offset+=n; count-=n;
        }
    }
    private static uint U32(byte[] b,int p)=>BinaryPrimitives.ReadUInt32LittleEndian(b.AsSpan(p,4));
    private static long I64(byte[] b,int p)=>BinaryPrimitives.ReadInt64LittleEndian(b.AsSpan(p,8));
}
internal sealed class SafePfs
{
    public sealed record Item(string Path, Bounded Data);
    private readonly Bounded data;
    private readonly PfsHeader header;
    private readonly int inodeSize;
    private long readBudget=256L<<30;
    public SafePfs(Bounded source, ulong flags=0, byte[]? ekpfs=null)
    {
        using var h=new MemoryStream(source.Bytes(0,1024),false);
        header=PfsHeader.ReadFromStream(h);
        if(header.BlockSize!=65536 || header.Mode.HasFlag(PfsMode.Is64Bit) || ((ushort)header.Mode & ~13)!=0 || header.DinodeCount is < 1 or > 100_000)
            throw new InvalidDataException("Unsupported PFS mode/block/inode count");
        inodeSize=header.Mode.HasFlag(PfsMode.Signed)?0x2c8:0xa8;
        var needed=(header.DinodeCount+(65536/inodeSize)-1)/(65536/inodeSize);
        if(header.DinodeBlockCount<needed || header.DinodeBlockCount>2048 || (header.DinodeBlockCount+1)*65536>source.Length)
            throw new InvalidDataException("PFS inode-table bounds");
        data=source;
        if(header.Mode.HasFlag(PfsMode.Encrypted))
        {
            if(ekpfs is not {Length:32}) throw new InvalidDataException("Supported fake-PKG mechanism unavailable");
            var (tweak,key)=Crypto.PfsGenEncKey(ekpfs,header.Seed,(flags & 0x2000000000000000UL)!=0);
            data=new SafeXts(source,key,tweak);
        }
    }
    private inode Inode(uint index)
    {
        if(index>=header.DinodeCount) throw new InvalidDataException("PFS inode index");
        var per=65536/inodeSize; var offset=65536L+(index/per)*65536L+(index%per)*inodeSize;
        using var bytes=new MemoryStream(data.Bytes(offset,inodeSize),false);
        var ino=header.Mode.HasFlag(PfsMode.Signed)?(inode)DinodeS32.ReadFromStream(bytes):DinodeD32.ReadFromStream(bytes);
        if(ino.Size<0 || ino.Size>64L<<30 || ino.Blocks>1_048_576 || ino.Size>(long)ino.Blocks*65536 || ino.Blocks>(ino.Size+65535)/65536+1)
            throw new InvalidDataException("PFS file/block allocation bounds");
        return ino;
    }
    private void CheckBlock(int b)
    {
        if(b<=header.DinodeBlockCount || b>(data.Length-1)/65536) throw new InvalidDataException("PFS data block range");
    }
    private Bounded Open(inode ino)
    {
        var count=checked((int)ino.Blocks); var blocks=new List<int>(count);
        if(count>0)
        {
            if(count==1 || ino.DirectBlocks[1]==-1)
            { for(int i=0;i<count;i++) { var b=checked(ino.StartBlock+i); CheckBlock(b); blocks.Add(b); } }
            else
            {
                var seen=new HashSet<int>();
                foreach(var b in ino.DirectBlocks.Take(Math.Min(12,count))) { CheckBlock(b); blocks.Add(b); }
                void Indirect(int block,int level)
                {
                    data.Token.ThrowIfCancellationRequested(); CheckBlock(block);
                    if(!seen.Add(block) || seen.Count>4096 || level>3) throw new InvalidDataException("PFS block-map cycle/limit");
                    var bytes=data.Bytes((long)block*65536,65536);
                    var stride=header.Mode.HasFlag(PfsMode.Signed)?36:4;
                    for(int i=0;i+stride<=bytes.Length && blocks.Count<count;i+=stride)
                    {
                        var b=BinaryPrimitives.ReadInt32LittleEndian(bytes.AsSpan(i+stride-4,4));
                        if(level==1) { CheckBlock(b); blocks.Add(b); } else Indirect(b,level-1);
                    }
                }
                for(int level=1;blocks.Count<count && level<=3;level++) Indirect(ino.IndirectBlocks[level-1],level);
                if(blocks.Count!=count || blocks.Distinct().Count()!=count) throw new InvalidDataException("PFS incomplete/aliased block map");
            }
        }
        return new BlockFile(data,blocks.ToArray(),ino.Size);
    }
    public List<Item> Files()
    {
        var pending=new Stack<(uint Inode,string Path,int Depth)>(); pending.Push((0,"",0));
        var seen=new HashSet<uint>(); var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var files=new List<Item>(); long total=0, directoryBytes=0; int nodes=0;
        while(pending.TryPop(out var current))
        {
            data.Token.ThrowIfCancellationRequested();
            if(current.Depth>32 || !seen.Add(current.Inode)) throw new InvalidDataException("PFS directory cycle/depth");
            var ino=Inode(current.Inode);
            directoryBytes=checked(directoryBytes+ino.Size);
            if(directoryBytes>64L<<20) throw new InvalidDataException("PFS directory budget");
            if(((ushort)ino.Mode & 0xf000)!=0x4000 || ino.Size>16L<<20) throw new InvalidDataException("PFS directory type/size");
            var directory=Open(ino);
            for(long p=0;p+16<=directory.Length;)
            {
                var h=directory.Bytes(p,16); var entry=BinaryPrimitives.ReadUInt32LittleEndian(h);
                var type=BinaryPrimitives.ReadInt32LittleEndian(h.AsSpan(4));
                var len=BinaryPrimitives.ReadInt32LittleEndian(h.AsSpan(8)); var size=BinaryPrimitives.ReadInt32LittleEndian(h.AsSpan(12));
                if(size==0) { p=(p/65536+1)*65536; continue; }
                if(size<16 || size>280 || size%8!=0 || len is < 1 or > 255 || len>size-16 || p>directory.Length-size || p%65536+size>65536)
                    throw new InvalidDataException("PFS dirent length/range");
                if(++nodes>100_000) throw new InvalidDataException("PFS node limit");
                var raw=directory.Bytes(p+16,len);
                if(raw.Any(b=>b<32 || b>126)) throw new InvalidDataException("PFS name encoding");
                var name=System.Text.Encoding.ASCII.GetString(raw);
                p+=size;
                if(type is 4 or 5) { if(name is not ("." or "..")) throw new InvalidDataException("PFS dot entry"); continue; }
                if(type is not (2 or 3)) throw new InvalidDataException("PFS special nodes unsupported");
                var path=current.Path+"/"+name;
                if(current.Depth==0 && name!="uroot") { Boundary.Relative("/uroot/"+name,32); continue; }
                if(current.Depth==0 && name=="uroot") { }
                else { Boundary.Relative(path+ (type==3?"/directory-check":""),34); }
                if(!names.Add(path)) throw new InvalidDataException("PFS name collision");
                if(type==3) pending.Push((entry,path,current.Depth+1));
                else
                {
                    if(!seen.Add(entry)) throw new InvalidDataException("PFS hardlinks/duplicate inode");
                    var f=Inode(entry);
                    if(((ushort)f.Mode & 0xf000)!=0x8000) throw new InvalidDataException("PFS file type");
                    total=checked(total+f.Size); if(total>64L<<30) throw new InvalidDataException("PFS total limit");
                    readBudget-=f.Size; if(readBudget<0) throw new InvalidDataException("PFS read budget");
                    files.Add(new Item(path,Open(f)));
                }
            }
        }
        if(!names.Contains("/uroot")) throw new InvalidDataException("PFS missing uroot");
        return files;
    }
}
#endif
