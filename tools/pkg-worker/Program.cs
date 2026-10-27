using Port.ExtractorLab;
using System.Text.Json;

if(args.Length==2 && args[0]=="--plan-base") {
    using var p=new PackageSource(args[1]);var plan=p.Plan(default);
    Console.WriteLine(JsonSerializer.Serialize(new {files=plan.Count,bytes=plan.Sum(e=>e.Size),empty=plan.Where(e=>e.Size==0).Select(e=>e.Name).ToArray()}));return 0;
}
if(args.Length!=3 || args[0]!="--extract-base") return 2;
using var cancel=new CancellationTokenSource(TimeSpan.FromMinutes(45));
_ = Task.Run(()=> { if(Console.ReadLine()=="cancel") cancel.Cancel(); });
try
{
    using var pkg=new PackageSource(args[1]);
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
