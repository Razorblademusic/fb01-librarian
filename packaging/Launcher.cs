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
  static string FindChrome() {
   string[] paths = {
    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),@"Google\Chrome\Application\chrome.exe"),
    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),@"Google\Chrome\Application\chrome.exe"),
    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),@"Google\Chrome\Application\chrome.exe")
   };
   foreach(string path in paths) if(File.Exists(path)) return path;
   throw new Exception("Google Chrome was not found. Install Chrome and try again.");
  }
  static void Run() {
   string root=AppDomain.CurrentDomain.BaseDirectory;
   foreach(string file in new [] {"index.html","app.js","bank.js"})
    if(!File.Exists(Path.Combine(root,file))) throw new Exception("Missing librarian file: "+file);
   string chrome=FindChrome();
   TcpListener server=new TcpListener(IPAddress.Loopback,0);
   server.Start();
   int port=((IPEndPoint)server.LocalEndpoint).Port;
   string url="http://127.0.0.1:"+port+"/";
   string profile=Path.Combine(Path.GetTempPath(),"FB01-Librarian-"+Guid.NewGuid().ToString("N"));
   Directory.CreateDirectory(profile);
   Process browser=null;
   try {
    browser=Process.Start(new ProcessStartInfo(chrome,"--user-data-dir=\""+profile+"\" --no-first-run --app=\""+url+"\"") {UseShellExecute=false});
    if(browser==null) throw new Exception("Unable to launch Google Chrome.");
    while(!browser.HasExited) {
     if(!server.Pending()) {Thread.Sleep(75);continue;}
     using(TcpClient client=server.AcceptTcpClient()) Serve(client,root);
    }
   } finally {
    server.Stop();
    if(browser!=null && !browser.HasExited) try {browser.Kill();} catch {}
    try {Directory.Delete(profile,true);} catch {}
   }
  }
  static void Serve(TcpClient client,string root) {
   try {
    client.ReceiveTimeout=3000; client.SendTimeout=3000;
    NetworkStream stream=client.GetStream();
    StreamReader reader=new StreamReader(stream,Encoding.ASCII);
    string first=reader.ReadLine();
    if(first==null) return;
    string line;
    while(!String.IsNullOrEmpty(line=reader.ReadLine())) {}
    string[] tokens=first.Split(' ');
    string path=tokens.Length>1 ? tokens[1].Split('?')[0] : "";
    string file=null, mime=null;
    switch(path) {
     case "/": case "/index.html": file="index.html";mime="text/html; charset=utf-8";break;
     case "/app.js": file="app.js";mime="text/javascript; charset=utf-8";break;
     case "/bank.js": file="bank.js";mime="text/javascript; charset=utf-8";break;
    }
    byte[] data=file==null ? new byte[0] : File.ReadAllBytes(Path.Combine(root,file));
    string header="HTTP/1.1 "+(file==null?"404 Not Found":"200 OK")+"\r\nContent-Length: "+data.Length+"\r\nContent-Type: "+(mime??"text/plain")+"\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
    byte[] h=Encoding.ASCII.GetBytes(header);
    stream.Write(h,0,h.Length);stream.Write(data,0,data.Length);stream.Flush();
   } catch(IOException) {} catch(SocketException) {}
  }
 }
}
