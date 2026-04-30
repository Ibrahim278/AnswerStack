import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Image
from cv_bridge import CvBridge

import threading
import base64
import numpy as np
import cv2
from http.server import HTTPServer, SimpleHTTPRequestHandler
import ssl
import json
import os
from typing import Callable


class FrameDecoder:
    """Decodes base64 video frame data to OpenCV images."""

    @staticmethod
    def decode(frame_data: str) -> np.ndarray | None:
        """Decode base64 frame data to OpenCV BGR image.

        Args:
            frame_data: Base64-encoded image data, optionally with data URL prefix.

        Returns:
            OpenCV BGR image array, or None if decoding fails.
        """
        if not frame_data:
            return None

        # Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
        if ',' in frame_data:
            frame_data = frame_data.split(',')[1]

        # Decode base64 to bytes
        img_bytes = base64.b64decode(frame_data)

        # Convert to numpy array and decode as image
        img_array = np.frombuffer(img_bytes, dtype=np.uint8)
        frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

        return frame


class HttpsServer:
    """Manages HTTP/HTTPS server lifecycle with optional SSL."""

    def __init__(self, host: str, port: int, handler_class,
                 cert_file: str = None, key_file: str = None,
                 logger=None):
        """Initialize and start the HTTP/HTTPS server.

        Args:
            host: Host address to bind to.
            port: Port number to listen on.
            handler_class: HTTP request handler class.
            cert_file: Path to SSL certificate file (optional).
            key_file: Path to SSL key file (optional).
            logger: Logger for status messages (optional).
        """
        self.host = host
        self.port = port
        self.logger = logger

        # Check if SSL certificates are available
        self.use_https = (cert_file and key_file and
                          os.path.isfile(cert_file) and os.path.isfile(key_file))

        if self.use_https:
            self.server = HTTPServer((host, port), handler_class)
            ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ssl_context.load_cert_chain(certfile=cert_file, keyfile=key_file)
            self.server.socket = ssl_context.wrap_socket(self.server.socket, server_side=True)
            self.protocol = 'https'
        else:
            # Use port 8080 for HTTP if default HTTPS port was used
            if port == 8443:
                self.port = 8080
            self.server = HTTPServer((host, self.port), handler_class)
            self.protocol = 'http'

        # Start server in background thread
        self.server_thread = threading.Thread(target=self.server.serve_forever)
        self.server_thread.daemon = True
        self.server_thread.start()

        self._log_startup()

    def _log_startup(self):
        """Log server startup information."""
        if not self.logger:
            return

        self.logger.info(f'Web camera server started at {self.protocol}://{self.host}:{self.port}')
        self.logger.info('Open this URL in your browser or phone to start streaming')

        if self.use_https:
            self.logger.info('Note: You will need to accept the self-signed certificate warning')
        else:
            self.logger.warn('Running in HTTP mode - webcam access may not work on remote devices')
            self.logger.warn('Generate certs with: openssl req -x509 -newkey rsa:2048 '
                             '-keyout key.pem -out cert.pem -days 365 -nodes')

    def shutdown(self):
        """Stop the server."""
        self.server.shutdown()


class WebCameraHandler(SimpleHTTPRequestHandler):
    """HTTP handler for routing requests and serving static files."""

    frame_callback: Callable[[np.ndarray], None] = None

    def __init__(self, *args, **kwargs):
        # Set the directory to serve static files from
        self.static_dir = os.path.join(os.path.dirname(__file__), 'static')
        super().__init__(*args, directory=self.static_dir, **kwargs)

    def log_message(self, format, *args):
        # Suppress HTTP logs to keep console clean
        pass

    def do_POST(self):
        """Handle POST requests with video frame data."""
        if self.path == '/frame':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)

            try:
                data = json.loads(post_data.decode('utf-8'))
                frame_data = data.get('frame', '')

                if frame_data and self.frame_callback:
                    frame = FrameDecoder.decode(frame_data)
                    if frame is not None:
                        self.frame_callback(frame)

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"status": "ok"}')

            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()


class WebCameraNode(Node):
    """ROS2 node that publishes webcam frames received from a web browser."""

    def __init__(self):
        super().__init__('web_camera')

        # Declare parameters
        self.declare_parameter('port', 8443)
        self.declare_parameter('host', '0.0.0.0')

        # SSL certificate paths - default to package certs directory
        default_cert_dir = os.path.join(os.path.dirname(__file__), '..', 'certs')
        self.declare_parameter('cert_file', os.path.join(default_cert_dir, 'cert.pem'))
        self.declare_parameter('key_file', os.path.join(default_cert_dir, 'key.pem'))

        # Create publisher
        self.publisher_ = self.create_publisher(Image, 'video_frames', 10)
        self.br = CvBridge()
        self.frame_count = 0

        # Set up frame callback for the handler
        WebCameraHandler.frame_callback = self._on_frame_received

        # Start HTTPS server
        self.server = HttpsServer(
            host=self.get_parameter('host').value,
            port=self.get_parameter('port').value,
            handler_class=WebCameraHandler,
            cert_file=self.get_parameter('cert_file').value,
            key_file=self.get_parameter('key_file').value,
            logger=self.get_logger()
        )

    def _on_frame_received(self, frame: np.ndarray):
        """Callback when a frame is received from the web browser."""
        msg = self.br.cv2_to_imgmsg(frame, encoding='bgr8')
        self.publisher_.publish(msg)
        self.frame_count += 1

        if self.frame_count % 100 == 0:
            self.get_logger().info(f'Published {self.frame_count} frames')

    def destroy_node(self):
        self.server.shutdown()
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)

    node = WebCameraNode()

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
