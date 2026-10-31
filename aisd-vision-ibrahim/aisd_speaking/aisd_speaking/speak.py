import io
import subprocess
import tempfile
from gtts import gTTS
from pydub import AudioSegment
from aisd_msgs.srv import Speak

import rclpy
from rclpy.node import Node



class SpeakService(Node):

    def __init__(self):
      super().__init__('speak_service')
      self.srv = self.create_service(Speak, 'speak', self.speak_callback)

    def speak_callback(self, request, response):
      self.get_logger().info(f"Speaking: {request.words}")
      try:
          # Create an in-memory bytes buffer to store the audio
          with io.BytesIO() as f:
              # Convert text to speech using Google TTS and write to buffer
              gTTS(text=request.words, lang='en').write_to_fp(f)
              # Reset buffer position to the beginning for reading
              f.seek(0)
              # Load the MP3 audio from the buffer into pydub
              song = AudioSegment.from_file(f, format="mp3")
              # Export to a temp WAV file and play with aplay
              with tempfile.NamedTemporaryFile(suffix='.wav', delete=True) as tmp:
                  song.export(tmp.name, format='wav')
                  subprocess.run(['aplay', tmp.name], stderr=subprocess.DEVNULL, timeout=120)
          self.get_logger().info("Done speaking")
          response.response = "OK"
      except Exception as e:
          self.get_logger().error(f"Error in speak: {e}")
          response.response = "ERROR"
      return response



def main():
    rclpy.init()

    speak_service = SpeakService()

    rclpy.spin(speak_service)

    rclpy.shutdown()


if __name__ == '__main__':
    main()