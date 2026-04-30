from setuptools import setup, find_packages
import os
from glob import glob

package_name = 'aisd_web_camera'

# Collect all static files
data_files = [
    ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
    ('share/' + package_name, ['package.xml']),
]

setup(
    name=package_name,
    version='0.0.1',
    packages=find_packages(exclude=['test']),
    data_files=data_files,
    install_requires=[
        'setuptools',
        'numpy>=1.24,<2',
    ],
    zip_safe=True,
    maintainer='aisd',
    maintainer_email='todo@todo.com',
    description='Web-based camera capture for ROS2 - allows using browser/phone webcam',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'web_camera = aisd_web_camera.web_camera_node:main',
        ],
    },
    package_data={
        'aisd_web_camera': ['static/*'],
    },
    include_package_data=True,
)
