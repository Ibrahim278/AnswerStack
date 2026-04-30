#!/usr/bin/env python

from std_msgs.msg import String
import rclpy
from rclpy.node import Node

import wave
import struct

from faster_whisper import WhisperModel


class WordsPublisher(Node):
    def __init__(self):
        super().__init__('words_publisher')
        self.publisher_ = self.create_publisher(String, 'words', 10)
        self.subscription = self.create_subscription(
            String,
            'recording',
            self.listener_callback,
            10)
        self.subscription  # prevent unused variable warning

        self.model = WhisperModel("small", compute_type="int8")
        self.get_logger().info("faster-whisper model loaded")

    def listener_callback(self, msg):
        self.get_logger().info('whisper is analysing: "%s"' % msg.data)

        text = String()
        text.data = self.mystt(msg.data)
        self.get_logger().info('I heard: "%s"' % text.data)
        self.publisher_.publish(text)

    def mystt(self, audio_path):
        segments, _ = self.model.transcribe(audio_path, language="en")
        result = " ".join(segment.text.strip() for segment in segments)
        self.get_logger().info('transcribe_result is: "%s"' % result)
        return result

def main(args=None):
    rclpy.init(args=args)

    words = WordsPublisher()

    rclpy.spin(words)

    words.destroy_node()
    rclpy.shutdown()

if __name__ == "__main__":
    main()
