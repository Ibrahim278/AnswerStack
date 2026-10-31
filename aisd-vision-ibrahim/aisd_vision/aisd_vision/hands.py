import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Image
from cv_bridge import CvBridge
import cv2
import mediapipe as mp
mp_hands = mp.solutions.hands

from aisd_msgs.msg import Hand


class Hands(Node):

    def __init__(self):
        super().__init__('hands')
        # Subscribe to video_frames topic to receive Image messages
        self.subscription = self.create_subscription(
            Image,
            'video_frames',
            self.listener_callback,
            10)
        self.subscription  # prevent unused variable warning
        
        # A converter between ROS and OpenCV images
        self.br = CvBridge()
        # Publisher for Hand messages to cmd_hand topic
        self.hand_publisher = self.create_publisher(Hand, 'cmd_hand', 10)

    def listener_callback(self, msg):
        # Convert ROS Image message to OpenCV image format
        image = self.br.imgmsg_to_cv2(msg)

        # MediaPipe landmark indices for finger tips
        PINKY_FINGER_TIP = 20
        INDEX_FINGER_TIP = 8
        
        # Analyse the image for hands
        with mp_hands.Hands(
            model_complexity=0,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5) as myhands:

            # To improve performance, optionally mark the image as not writeable to
            # pass by reference.
            image.flags.writeable = False
            # Convert image from BGR (OpenCV) to RGB (MediaPipe requirement)
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            # Process the image to detect hands
            results = myhands.process(image)
            # Check if any hands were detected
            if results.multi_hand_landmarks:
                # Publish the hand position in terms of index finger and pinky
                msg = Hand()
                # Get x-coordinate of pinky finger tip 
                msg.xpinky = results.multi_hand_landmarks[0].landmark[PINKY_FINGER_TIP].x
                # Get x-coordinate of index finger tip 
                msg.xindex = results.multi_hand_landmarks[0].landmark[INDEX_FINGER_TIP].x
                # Only publish if there are subscribers listening
                if self.hand_publisher.get_subscription_count() > 0:
                    self.hand_publisher.publish(msg)
                else:
                    self.get_logger().info('waiting for subcriber')


def main(args=None):
    rclpy.init(args=args)

    hands = Hands()

    rclpy.spin(hands)

    # Destroy the node explicitly
    # (optional - otherwise it will be done automatically
    # when the garbage collector destroys the node object)
    hands.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
