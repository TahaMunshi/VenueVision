# Contributing to VenueVision

Thank you for your interest in contributing to VenueVision! This is a Final Year Project (FYP), but we welcome contributions from the community.

## 🚀 Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/VenueVision.git
   cd VenueVision
   ```
3. **Set up the development environment** (see [QUICK_START.md](QUICK_START.md))
4. **Create a new branch** for your feature:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 📝 Development Guidelines

### Code Style

**Python (Backend)**:
- Follow PEP 8 style guide
- Use type hints where possible
- Write docstrings for functions and classes
- Keep functions small and focused

**TypeScript (Frontend)**:
- Use TypeScript strict mode
- Follow React best practices
- Use functional components with hooks
- Maintain consistent naming conventions

### Commit Messages

Use conventional commit format:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Examples:
```
feat: Add multi-venue support
fix: Resolve image upload error
docs: Update installation instructions
```

## 🧪 Testing

Before submitting:
1. Test with Docker: `docker-compose up --build`
2. Test authentication flow (signup/login)
3. Test venue creation and editing
4. Test wall capture and 3D viewer
5. Check for console errors in browser

## 📋 Pull Request Process

1. **Update documentation** if you've made changes to:
   - API endpoints
   - Configuration options
   - User interface
   - Installation steps

2. **Ensure your code works** with Docker:
   ```bash
   docker-compose down -v
   docker-compose up --build
   ```

3. **Update the README.md** if needed

4. **Submit your PR** with:
   - Clear description of changes
   - Screenshots (for UI changes)
   - Reference to any related issues

5. **Respond to feedback** from maintainers

## 🐛 Reporting Bugs

When reporting bugs, please include:
- **Description**: What happened vs. what you expected
- **Steps to reproduce**: Detailed steps
- **Environment**: OS, Docker version, browser
- **Screenshots**: If applicable
- **Console logs**: Browser console and server logs

## 💡 Suggesting Features

We love feature suggestions! Please:
- Check if it's already been suggested
- Explain the use case
- Describe how it would work
- Consider the scope (is it a small enhancement or major feature?)

## 🔒 Security

If you discover a security vulnerability:
- **DO NOT** open a public issue
- Email the maintainer directly
- Provide details of the vulnerability
- Allow time for a fix before public disclosure

## 📦 Project Structure

```
VenueVision/
├── server/              # Flask backend
│   ├── api/            # API endpoints
│   ├── services/       # Business logic
│   ├── middleware/     # Auth middleware
│   └── utils/          # Utilities
├── src/                # React frontend
│   ├── pages/         # Page components
│   ├── components/    # Reusable components
│   └── utils/         # Frontend utilities
└── docker/            # Docker configuration
```

## 🎯 Good First Issues

Looking for a place to start? Check for issues labeled:
- `good first issue` - Easy for newcomers
- `help wanted` - We need community help
- `documentation` - Improve docs

## 📞 Getting Help

- **Documentation**: Check the README.md and guides
- **Issues**: Search existing issues
- **Questions**: Open a discussion (not an issue)

## 📄 License

By contributing, you agree that your contributions will be licensed under the same license as the project.

## 🙏 Thank You!

Every contribution helps make VenueVision better. Whether it's:
- Code improvements
- Bug reports
- Documentation
- Feature suggestions
- Spreading the word

We appreciate you! 🎉

---

**Happy Contributing!** 🚀
