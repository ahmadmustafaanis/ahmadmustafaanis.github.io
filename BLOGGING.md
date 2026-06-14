# Writing a blog post

Create a Markdown file in `_blogs/`. The filename becomes the post URL, so use a
short lowercase slug such as `_blogs/curriculum-learning-basics.md`.

Start each file with this front matter:

```yaml
---
title: "Curriculum Learning: Where to Start"
description: "A short summary used on blog cards and in search previews."
date: 2026-06-14
topic: Curriculum Learning
read_time: 6 min read
---
```

Then write normal Markdown:

```markdown
## The core idea

Curriculum learning orders training examples from easier to harder...

### A smaller section

- Lists work
- **Bold text** works
- [Links](https://example.com) work
```

The `topic` field is optional. Posts with the same topic are grouped together on
the blog page. If `topic` is omitted, the post appears under **Other notes**.

The homepage automatically displays the three newest posts by `date`. The full
archive is available at `/blog/`; there is no list or manifest to update.
