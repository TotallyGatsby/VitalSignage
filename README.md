Simple heart rate visualization. 

Two components:

* A node.js HR reader that opens a websocket and streams HR data
* A simple HTML visualization of that data

Demo
====
Try running it in verbose demo mode:

node index.js -vv -d

... then open index.html

Equipment
========
I use these things:

Suunto ANT+ Stick: https://www.amazon.com/Suunto-Movestick-Mini-Black-Size/dp/B004YJSD20
Motorola HR Monitor: https://www.amazon.com/Motorola-Monitor-MOTOACTV-Compatible-Devices/dp/B006K0PFEU/

Hypothetically it should work with other stuff? I just haven't tested with them.

LIBUSB
======
I've had to use WINUSB as my driver for this device to get this to work.