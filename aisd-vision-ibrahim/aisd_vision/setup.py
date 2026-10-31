from setuptools import find_packages, setup

package_name = 'aisd_vision'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=[
        'setuptools',
        'numpy>=1.24,<2',
        'mediapipe==0.10.14',
        'opencv-contrib-python',
    ],
    zip_safe=True,
    maintainer='aisd',
    maintainer_email='aisd@todo.todo',
    description='TODO: Package description',
    license='Apache-2.0',
    extras_require={
        'test': [
            'pytest',
        ],
    },
    entry_points={
        'console_scripts': [
            'image_publisher = aisd_vision.image_publisher:main',
            'hands = aisd_vision.hands:main',
            'redball = aisd_vision.redball:main',
        ],
    },
)
