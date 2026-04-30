import rclpy
from rclpy.node import Node
from aisd_msgs.msg import Hand
from geometry_msgs.msg import Twist


class Move(Node):

    def __init__(self):
        super().__init__('move')
        # Subscribe to cmd_hand topic to receive Hand messages
        self.subscription = self.create_subscription(
            Hand,
            'cmd_hand',
            self.listener_callback,
            10)
        self.subscription  # prevent unused variable warning
        
        # Publisher for Twist messages to cmd_vel topic (robot velocity commands)
        self.vel_publisher = self.create_publisher(Twist, 'cmd_vel', 10)

    def listener_callback(self, msg):
        # Initialize angular and linear velocity
        angle = 0.0
        linear = 0.0
        
        # Determine turning direction based on index finger x-position
        # If index finger is on the right side of the frame (x > 0.55), turn right
        if msg.xindex > 0.55:
            self.get_logger().info('right')
            angle = -0.2  # Negative angular velocity turns right
        # If index finger is on the left side of the frame (x < 0.45), turn left
        elif msg.xindex < 0.45:
            self.get_logger().info('left')
            angle = 0.2  # Positive angular velocity turns left
        # If index finger is in the center, don't turn
        else:
            angle = 0.0
        
        # Determine forward movement based on finger positions
        # If index finger is to the right of pinky, move forward
        if msg.xindex > msg.xpinky:
            self.get_logger().info('come')
            linear = 0.5  # Move forward at 0.5 m/s
        # Otherwise, stay still
        else:
            self.get_logger().info('stay')
            linear = 0.0
        
        # Create Twist message with calculated velocities
        twist = Twist()
        twist.linear.x = linear  # Forward/backward velocity
        twist.angular.z = angle  # Rotational velocity
        
        # Only publish if there are subscribers listening to cmd_vel
        if self.vel_publisher.get_subscription_count() > 0:
            self.vel_publisher.publish(twist)
        else:
            self.get_logger().info('waiting for subcriber')


def main(args=None):
    rclpy.init(args=args)

    move = Move()

    rclpy.spin(move)

    # Destroy the node explicitly
    # (optional - otherwise it will be done automatically
    # when the garbage collector destroys the node object)
    move.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
