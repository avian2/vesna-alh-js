import SimpleHTTPServer
import SocketServer
import urllib

from vesna.alh import ALHURLOpener
urllib._urlopener = ALHURLOpener()

ENDPOINT_HOST = "https://crn.log-a-tec.eu"

class MyHTTPRequestHandler(SimpleHTTPServer.SimpleHTTPRequestHandler):
	def do_GET(self):
		if self.path.startswith("/communicator"):
			url = ENDPOINT_HOST + self.path
			self.log_message("proxy to %s", url)
			self.copyfile(urllib.urlopen(url), self.wfile)
		else:
			return SimpleHTTPServer.SimpleHTTPRequestHandler.do_GET(self)

PORT = 8000

SocketServer.TCPServer.allow_reuse_address = True
httpd = SocketServer.TCPServer(("", PORT), MyHTTPRequestHandler)

print "serving at http://localhost:%d" % PORT
httpd.serve_forever()
