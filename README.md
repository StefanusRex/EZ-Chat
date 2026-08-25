# EZ Chat

EZ Chat is a private chat and video app. You can send messages and make video calls directly between two web browsers.

## Start the app

You only need to do this the first time, or after restarting your computer.

### 1. Install Docker Desktop

Docker Desktop is the program that runs EZ Chat.

Download it from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/), install it, and open it. Wait until Docker Desktop says it is running.

### 2. Open a terminal

On macOS, open the **Terminal** app. On Windows, open **PowerShell**. On Linux, open your usual **Terminal** app.

### 3. Go to the EZ Chat folder

Copy and paste the command below into the terminal, then press Enter:

```sh
cd /Users/steven/Projects/WebRTC
```

If the project folder is somewhere else, replace the path with the location of your EZ Chat folder.

### 4. Start EZ Chat

Copy and paste this command, then press Enter:

```sh
docker compose up --build
```

Leave this terminal window open while you use the app. The first start may take a few minutes while Docker downloads what it needs.

### 5. Open the app

Open a web browser and visit:

**http://localhost:8080**

## Start a conversation

1. Click **Connect room**.
2. Choose **Create room**.
3. Click **Create room**.
4. Click **Copy URL** and send the URL to the other person.
5. The other person opens that URL, clicks **Connect room**, and chooses **Join room**.

The two browsers should connect automatically. No password is needed.

## Use video and audio

After the chat connects:

- Click the microphone button to turn your microphone on or off.
- Click the webcam button to turn on both your webcam and microphone.
- Click **End call** to stop the video call.

When the browser asks for permission, choose **Allow** for the microphone and camera.

## Stop the app

Return to the terminal running EZ Chat and press **Control + C**.

To stop and remove the Docker container later, run:

```sh
cd /Users/steven/Projects/WebRTC
docker compose down
```

## Using another computer

The other computer must be able to reach the computer running EZ Chat. Use the host computer's local network address instead of `localhost`, for example:

```text
http://192.168.1.20:8080
```

For webcam and microphone access on another computer, browsers normally require an HTTPS address. Use a secure HTTPS address when deploying EZ Chat outside your own computer.

## Troubleshooting

- **Docker is not running:** Open Docker Desktop and wait for it to finish starting.
- **The page does not open:** Make sure the terminal still shows EZ Chat running and that you used `http://localhost:8080`.
- **The other person cannot connect:** Make sure both people opened the same room URL.
- **The camera or microphone does not work:** Check the browser's site permissions and allow access to both devices.
