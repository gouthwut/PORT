using Port.ExtractorLab;
using System.Text.Json;
using System.Security.Cryptography;

// Developer-only read-only diagnostic. No extraction or application command for updates.
if(args.Length==2 && args[0]=="--audit-update") {
    using var timeout=new CancellationTokenSource(TimeSpan.FromMinutes(5));
    using var p=new PackageSource(args[1],inspectUpdate:true,timeout.Token,auditOnly:true);
    var plan=p.Plan(timeout.Token);
    var files=plan.Select(e=> {
        using var stream=e.Open();
        var prefix=new byte[(int)Math.Min(16,e.Size)]; stream.ReadExactly(prefix);
        using var hash=IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        hash.AppendData(prefix); var buffer=new byte[65536]; long size=prefix.Length;
        for(int n;(n=stream.Read(buffer))>0;) {timeout.Token.ThrowIfCancellationRequested();hash.AppendData(buffer,0,n);size+=n;}
        if(size!=e.Size) throw new InvalidDataException("Entry length changed");
        return new {name=e.Name,size,header=Convert.ToHexString(prefix),sha256=Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant()};
    }).ToArray();
    Console.WriteLine(JsonSerializer.Serialize(new {files,bytes=files.Sum(e=>e.size),delta=p.AuditDeltaMetadata(),auditOnly=true}));return 0;
}

if(args.Length==2 && args[0]=="--plan-base") {
    using var p=new PackageSource(args[1]);var plan=p.Plan(default);
    Console.WriteLine(JsonSerializer.Serialize(new {files=plan.Count,bytes=plan.Sum(e=>e.Size),empty=plan.Where(e=>e.Size==0).Select(e=>e.Name).ToArray()}));return 0;
}
if(args.Length!=3 || args[0] is not ("--extract-base" or "--extract-confirmed-update")) return 2;
using var cancel=new CancellationTokenSource(TimeSpan.FromMinutes(45));
_ = Task.Run(()=> { if(Console.ReadLine()=="cancel") cancel.Cancel(); });
try
{
    using var pkg=new PackageSource(args[1],args[0]=="--extract-confirmed-update",cancel.Token);
    var entries=pkg.Plan(cancel.Token);
    Console.WriteLine(JsonSerializer.Serialize(new {phase="extracting", completed=0L, total=entries.Sum(e=>e.Size)}));
    long last=0;
    Boundary.Extract(entries,args[2],pkg.Length,new Limits(),cancel.Token,(done,total)=> {
        var now=Environment.TickCount64;
        if(now-last>250 || done==total) { Console.WriteLine(JsonSerializer.Serialize(new {phase="extracting",completed=done,total})); last=now; }
    });
    return 0;
}
catch(Exception e) when(e is IOException or InvalidDataException or ArgumentException or OperationCanceledException or OverflowException or InvalidOperationException)
{ Console.Error.WriteLine(e.Message); return cancel.IsCancellationRequested?130:1; }
