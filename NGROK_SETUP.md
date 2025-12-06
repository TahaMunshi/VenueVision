# Ngrok Setup for Global Access

This guide will help you set up ngrok to make your application accessible from anywhere in the world.

## What is Ngrok?

Ngrok creates a secure tunnel from the internet to your local server, allowing you to access your application from anywhere using a public URL.

## Installation

### Option 1: Download from Website (Recommended)
1. Go to https://ngrok.com/download
2. Download ngrok for Windows
3. Extract the `ngrok.exe` file to a folder (e.g., `C:\ngrok\`)

### Option 2: Using Package Manager
```powershell
# Using Chocolatey (if installed)
choco install ngrok

# Using Scoop (if installed)
scoop install ngrok
```

## Setup Steps

### 1. Sign Up for Free Account (Optional but Recommended)
- Go to https://dashboard.ngrok.com/signup
- Create a free account
- Get your authtoken from the dashboard

### 2. Configure Ngrok
```powershell
# Set your authtoken (replace YOUR_AUTHTOKEN with your actual token)
ngrok config add-authtoken YOUR_AUTHTOKEN
```

### 3. Start Your Flask Server
```powershell
# In your project directory
python server/app.py
```

The server should be running on `http://localhost:5000`

### 4. Start Ngrok Tunnel
Open a **new terminal/PowerShell window** and run:

```powershell
ngrok http 5000
```

You'll see output like:
```
Forwarding   https://abc123.ngrok-free.app -> http://localhost:5000
```

### 5. Access Your Application

Use the ngrok URL (e.g., `https://abc123.ngrok-free.app`) to access your application:
- **Home Page**: `https://abc123.ngrok-free.app/mobile`
- **Guided Tour**: `https://abc123.ngrok-free.app/mobile/capture/demo-venue`
- **3D Viewer**: `https://abc123.ngrok-free.app/mobile/view/demo-venue`

## Important Notes

### Free Tier Limitations
- **Session Timeout**: Free ngrok tunnels expire after 2 hours
- **Random URLs**: Each time you restart ngrok, you get a new URL
- **Connection Limits**: Limited concurrent connections

### Paid Tier Benefits
- Reserved domains (same URL every time)
- No session timeouts
- More concurrent connections
- Custom domains

## Keeping Ngrok Running

### Option 1: Keep Terminal Open
Simply keep the ngrok terminal window open while developing.

### Option 2: Run in Background (Windows)
```powershell
Start-Process ngrok -ArgumentList "http 5000" -WindowStyle Hidden
```

### Option 3: Use ngrok Configuration File
Create `ngrok.yml` in your home directory:

```yaml
version: "2"
authtoken: YOUR_AUTHTOKEN
tunnels:
  fyp:
    proto: http
    addr: 5000
    bind_tls: true
```

Then run:
```powershell
ngrok start fyp
```

## Troubleshooting

### "ngrok: command not found"
- Make sure ngrok.exe is in your PATH
- Or use the full path: `C:\ngrok\ngrok.exe http 5000`

### "Tunnel session expired"
- Restart ngrok: Press `Ctrl+C` and run `ngrok http 5000` again
- You'll get a new URL

### "Connection refused"
- Make sure Flask server is running on port 5000
- Check firewall settings

### Frontend not loading via ngrok
- The frontend auto-detects ngrok URLs
- Make sure you're accessing via the ngrok URL, not localhost
- Check browser console for errors

## Quick Start Script

Create a file `start_with_ngrok.ps1`:

```powershell
# Start Flask server in background
Start-Process python -ArgumentList "server/app.py" -WindowStyle Minimized

# Wait a moment for server to start
Start-Sleep -Seconds 3

# Start ngrok
ngrok http 5000
```

Run it with:
```powershell
.\start_with_ngrok.ps1
```

## Security Considerations

⚠️ **Important**: When using ngrok, your local server is exposed to the internet!

1. **Don't expose production servers** without proper security
2. **Use HTTPS**: ngrok provides HTTPS by default
3. **Monitor access**: Check ngrok dashboard for connections
4. **Use authentication**: Add login if handling sensitive data

## Testing from Mobile Device

1. Start ngrok and get your URL
2. On your phone, open the ngrok URL
3. The frontend will automatically detect ngrok and use it for API calls
4. Test camera capture and upload features

## Next Steps

- For persistent URLs, consider ngrok paid plan
- Set up custom domain (paid feature)
- Configure webhook endpoints if needed
- Monitor usage in ngrok dashboard

