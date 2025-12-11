# Git Workflow Guide

This repository uses a branch-based workflow where all development happens on individual branches, and changes are merged to `main` via pull requests.

## Branch Structure

- **`main`**: The production-ready, final working app. Only merged code via pull requests.
- **`taha`**: Taha's development branch
- **`omer`**: Omer's development branch
- **`yumman`**: Yumman's development branch

## Workflow Rules

### ✅ DO:
- Always work on your personal branch (`taha`, `omer`, or `yumman`)
- Push your changes to your branch
- Create pull requests to merge into `main`
- Keep your branch up to date with `main` regularly

### ❌ DON'T:
- Push directly to `main` branch
- Commit to `main` locally (unless merging a PR)
- Force push to `main`

## Daily Workflow

### 1. Starting Work (First Time Setup)

```bash
# Clone the repository (if you haven't already)
git clone https://github.com/TahaMunshi/VenueVision.git
cd VenueVision

# Switch to your branch
git checkout taha    # or 'omer' or 'yumman'
```

### 2. Starting Work (Daily)

```bash
# Make sure you're on your branch
git checkout taha    # or 'omer' or 'yumman'

# Pull latest changes from main
git pull origin main

# Merge main into your branch to stay up to date
git merge main

# Or use rebase (cleaner history)
# git rebase main
```

### 3. Making Changes

```bash
# Make your code changes
# ... edit files ...

# Stage your changes
git add .

# Commit with a descriptive message
git commit -m "Add feature: description of what you did"

# Push to your branch
git push origin taha    # or 'omer' or 'yumman'
```

### 4. Creating a Pull Request

1. Go to GitHub: https://github.com/TahaMunshi/VenueVision
2. Click "Pull requests" tab
3. Click "New pull request"
4. Set:
   - **Base branch**: `main`
   - **Compare branch**: `taha` (or `omer` or `yumman`)
5. Add a description of your changes
6. Request review from team members
7. Click "Create pull request"

### 5. After PR is Merged

```bash
# Switch back to main
git checkout main

# Pull the merged changes
git pull origin main

# Switch back to your branch
git checkout taha    # or 'omer' or 'yumman'

# Update your branch with the latest main
git merge main
```

## Quick Reference Commands

### Check which branch you're on
```bash
git branch
```

### Switch branches
```bash
git checkout taha
git checkout omer
git checkout yumman
git checkout main
```

### See what files changed
```bash
git status
```

### See commit history
```bash
git log --oneline
```

### Update your branch with latest main
```bash
git checkout taha
git pull origin main
git merge main
```

## Branch Protection (Recommended Setup)

To enforce this workflow, set up branch protection on GitHub:

1. Go to: https://github.com/TahaMunshi/VenueVision/settings/branches
2. Add a branch protection rule for `main`:
   - ✅ Require pull request reviews before merging
   - ✅ Require status checks to pass before merging
   - ✅ Include administrators
   - ✅ Restrict pushes that create files larger than 100 MB

This will prevent direct pushes to `main` and enforce the pull request workflow.

## Troubleshooting

### "Your branch is behind 'origin/main'"
```bash
git checkout taha
git pull origin main
git merge main
```

### "You have uncommitted changes"
```bash
# Option 1: Commit them
git add .
git commit -m "Your message"
git push

# Option 2: Stash them temporarily
git stash
# ... do your work ...
git stash pop
```

### Accidentally committed to main
```bash
# Create a new branch from main (saves your work)
git checkout main
git checkout -b temp-branch

# Reset main to match remote
git checkout main
git reset --hard origin/main

# Move your commits to your branch
git checkout taha
git cherry-pick <commit-hash>
```

## Team Members

- **Taha**: Use `taha` branch
- **Omer**: Use `omer` branch  
- **Yumman**: Use `yumman` branch

---

**Remember**: Always work on your branch, never on `main` directly!

