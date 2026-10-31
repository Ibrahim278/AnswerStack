#!/usr/bin/env python
from ament_index_python.packages import get_package_share_directory
from sys import byteorder
import sys
from array import array
from struct import pack
import os
import subprocess

import wave

import rclpy
from rclpy.node import Node
from std_msgs.msg import String


THRESHOLD = 1200 # volume threshold for silence detection
CHUNK_SIZE = 1024 # number of audio chunks to record at once
RATE = 16000 # recording sample rate

class RecordingPublisher(Node):
    def __init__(self):
        super().__init__('recording_publisher')
        self.publisher_ = self.create_publisher(String, 'recording', 10)
        self.listening = False
        self.create_timer(1,self.listen) # check once per second

    def listen(self):
        if self.listening:
            return
        else:
            self.listening = True
        ##################################
        # TODO (not required for Assignment 3) Change the audio_path to a parameter
        ##################################
        audio_path = get_package_share_directory('aisd_hearing')
        audio_path =  audio_path + "/recordings"
        while 1:
            current_time = str(self.get_clock().now().nanoseconds)
            audio_file = "{}/{}.wav".format(audio_path, current_time)

            try:
                has_speech = record_to_file(audio_file)
            except Exception as e:
                print(f"Error recording audio: {e}")
                import traceback
                traceback.print_exc()
                sys.exit(1)

            if not has_speech:
                continue

            msg = String()
            msg.data = audio_file
            self.publisher_.publish(msg)

def is_silent(snd_data):
    "Returns 'True' if below the 'silent' threshold"
    return max(snd_data) < THRESHOLD

def normalize(snd_data):
    "Average the volume out"
    MAXIMUM = 16384
    times = float(MAXIMUM)/max(abs(i) for i in snd_data)

    r = array('h')
    for i in snd_data:
        r.append(int(i*times))
    return r

def trim(snd_data):
    "Trim the blank spots at the start and end"
    def _trim(snd_data):
        snd_started = False
        r = array('h')

        for i in snd_data:
            if not snd_started and abs(i)>THRESHOLD:
                snd_started = True
                r.append(i)

            elif snd_started:
                r.append(i)
        return r

    # Trim to the left
    snd_data = _trim(snd_data)

    # Trim to the right
    snd_data.reverse()
    snd_data = _trim(snd_data)
    snd_data.reverse()
    return snd_data

def add_silence(snd_data, seconds, rate):
    "Add silence to the start and end of 'snd_data' of length 'seconds' (float)"
    r = array('h', [0 for i in range(int(seconds*rate))])
    r.extend(snd_data)
    r.extend([0 for i in range(int(seconds*rate))])
    return r

def record():
    """
    Record a word or words from the microphone using arecord and
    return the data as an array of signed shorts.

    Uses arecord (ALSA) which routes through PulseAudio/PipeWire
    for reliable audio capture in containerized environments.

    Normalizes the audio, trims silence from the
    start and end, and pads with 0.5 seconds of
    blank sound to make sure VLC et al can play
    it without getting chopped off.
    """
    # Start arecord as a subprocess, streaming raw PCM data
    proc = subprocess.Popen(
        ['arecord', '-f', 'S16_LE', '-r', str(RATE), '-c', '1', '-t', 'raw'],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL
    )

    num_silent = 0
    snd_started = False
    num_chunks = 0
    max_wait_chunks = int(RATE / CHUNK_SIZE * 10)  # max 10 seconds waiting for speech

    r = array('h')

    while 1:
        # Read a chunk of raw PCM data
        raw_data = proc.stdout.read(CHUNK_SIZE * 2)  # 2 bytes per sample (16-bit)
        if not raw_data:
            break
        snd_data = array('h', raw_data)
        if byteorder == 'big':
            snd_data.byteswap()
        r.extend(snd_data)

        silent = is_silent(snd_data)
        num_chunks += 1

        if silent and snd_started:
            num_silent += 1
        elif not silent and not snd_started:
            snd_started = True

        if snd_started and num_silent > 30:
            break

        # Timeout: if no speech detected after max_wait_chunks, give up
        if not snd_started and num_chunks > max_wait_chunks:
            proc.terminate()
            proc.wait()
            return 2, None  # no speech detected

    proc.terminate()
    proc.wait()

    r = normalize(r)
    r = trim(r)
    r = add_silence(r, 0.5, RATE)
    return 2, r  # sample_width=2 for 16-bit audio

def record_to_file(path):
    "Records from the microphone and outputs the resulting data to 'path'. Returns False if no speech detected."
    sample_width, data = record()

    if data is None:
        return False

    data_bytes = pack('<' + ('h'*len(data)), *data)

    wf = wave.open(path, 'wb')
    wf.setnchannels(1)
    wf.setsampwidth(sample_width)
    wf.setframerate(RATE)
    wf.writeframes(data_bytes)
    wf.close()
    return True
        
def main(args=None):
    rclpy.init(args=args)

    recording = RecordingPublisher()

    rclpy.spin(recording)

    # Destroy the node explicitly
    # (optional - otherwise it will be done automatically
    # when the garbage collector destroys the node object)
    recording.destroy_node()
    rclpy.shutdown()
if __name__ == "__main__":
    main()
