# Git & GitHub Setup Guide

This guide will help you set up Git and GitHub to easily share your project with friends.

## Quick Setup (5 minutes)

### Step 1: Install Git (if not already installed)
1. Download from: https://git-scm.com/download/win
2. Install with default settings
3. Verify installation: Open PowerShell and run `git --version`

### Step 2: Create GitHub Account
1. Go to: https://github.com/signup
2. Create a free account
3. Verify your email

### Step 3: Initialize Git in Your Project

Run these commands in PowerShell (in your project folder):

```powershell
# Initialize git repository
git init

# Add all files (except those in .gitignore)
git add .

# Create first commit
git commit -m "Initial commit: Event Space Visualizer project"

# Add your GitHub repository (replace YOUR_USERNAME and YOUR_REPO_NAME)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Step 4: Create GitHub Repository

1. Go to: https://github.com/new
2. Repository name: `event-space-visualizer` (or any name you like)
3. Description: "3D Event Space Visualizer with Wall Capture"
4. Choose: **Public** (so friends can access) or **Private** (invite specific people)
5. **DO NOT** initialize with README, .gitignore, or license (we already have these)
6. Click "Create repository"
7. Copy the repository URL and use it in Step 3 above

## Sharing with Friends

### Option 1: Public Repository (Easiest)
- Friends can access via: `https://github.com/YOUR_USERNAME/YOUR_REPO_NAME`
- They can clone with: `git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git`

### Option 2: Private Repository + Invite
1. Go to your repository on GitHub
2. Click "Settings" → "Collaborators"
3. Click "Add people"
4. Enter their GitHub username or email
5. They'll receive an invitation

## Updating the Project

When you make changes, share them easily:

```powershell
# Stage all changes
git add .

# Commit with a message
git commit -m "Description of what you changed"

# Push to GitHub
git push
```

Your friends can get updates with:
```powershell
git pull
```

## Benefits

✅ **No more zipping** - Just push updates  
✅ **Version history** - See all changes over time  
✅ **Easy collaboration** - Multiple people can work together  
✅ **Free** - GitHub is free for public and private repos  
✅ **Fast** - Only changed files are uploaded  
✅ **Professional** - Standard way developers share code  

## Quick Commands Reference

```powershell
# Check status
git status

# See what changed
git diff

# View commit history
git log

# Create a new branch
git checkout -b feature-name

# Switch branches
git checkout main

# Undo changes (before committing)
git restore filename

# See remote repository
git remote -v
```

## Troubleshooting

### "Git is not recognized"
- Install Git from https://git-scm.com/download/win
- Restart PowerShell after installation

### "Permission denied"
- Make sure you're logged into GitHub
- Use GitHub Desktop app for easier authentication

### "Repository not found"
- Check the repository URL is correct
- Make sure the repository exists on GitHub
- For private repos, ensure you're logged in

## Alternative: GitHub Desktop (Easier GUI)

If you prefer a visual interface:
1. Download: https://desktop.github.com/
2. Sign in with your GitHub account
3. File → Add Local Repository
4. Select your project folder
5. Click "Publish repository" button

## Need Help?

- Git documentation: https://git-scm.com/doc
- GitHub Guides: https://guides.github.com/
- GitHub Desktop: https://desktop.github.com/

