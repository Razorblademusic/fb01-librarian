using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace FB01Librarian {
 static class Launcher {
  [STAThread] static void Main() {
   try { Run(); } catch(Exception e) { MessageBox.Show(e.Message,"FB-01 Librarian",MessageBoxButtons.OK,MessageBoxIcon.Error); }
  }
  static void Run() {
   string root=AppDomain.CurrentDomain.BaseDirectory;
   string edge=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),@"Microsoft\Edge\Application\msedge.exe");
   if(!File.Exists(edge)) edge=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),@"Microsoft\Edge\Application\msedge.exe");
   if(!File.Exists(edge)) throw new Exception("Microsoft Edge is required. Install Edge and try again.");
   var socket=new TcpListener(IPAddress.Loopback,0); socket.Start();
   int port=((IPEndPoint)socket.LocalEndpoint).Port; socket.Stop();
   string prefix="http://127.0.0.1:"+port+"/";
   using(var listener=new HttpListener()) {
    listener.Prefixes.Add(prefix); listener.Start();
    string profile=Path.Combine(Path.GetTempPath(),"FB01-Librarian-"+Guid.NewGuid().ToString("N"));
    Directory.CreateDirectory(profile);
    Process browser=null;
    try {
     browser=Process.Start(new ProcessStartInfo(edge,"--user-data-dir=\""+profile+"\" --no-first-run --app=\""+prefix+"\"") {UseShellExecute=false});
     if(browser==null) throw new Exception("Could not launch Microsoft Edge.");
     while(!browser.HasExited) {
      var ar=listener.BeginGetContext(null,null);
      while(!ar.AsyncWaitHandle.WaitOne(150)) if(browser.HasExited) break;
      if(browser.HasExited) break;
      HttpListenerContext ctx;
      try {ctx=listener.EndGetContext(ar);} catch {break;}
      Serve(ctx,root);
     }
    } finally {
     listener.Stop();
     try { Directory.Delete(profile,true); } catch { /* Edge may still be releasing files */ }
    }
   }
  }
  static void Serve(HttpListenerContext ctx,string root) {
   string path=ctx.Request.Url.AbsolutePath;
   string name,content;
   switch(path) {
    case "/": case "/index.html": name="index.html"; content="text/html; charset=utf-8"; break;
    case "/app.js": name="app.js"; content="text/javascript; charset=utf-8"; break;
    case "/bank.js": name="bank.js"; content="text/javascript; charset=utf-8"; break;
    default: ctx.Response.StatusCode=404; ctx.Response.Close(); return;
   }
   try {
    byte[] data=File.ReadAllBytes(Path.Combine(root,name));
    ctx.Response.ContentType=content; ctx.Response.ContentLength64=data.Length;
    ctx.Response.Headers.Add("Cache-Control","no-store");
    ctx.Response.OutputStream.Write(data,0,data.Length);
   } catch { try {ctx.Response.StatusCode=500;} catch {} }
   finally {try {ctx.Response.Close();} catch {}}
  }
 }
}
