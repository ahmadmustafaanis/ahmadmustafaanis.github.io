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

## Equations and loss functions

Inline equations use `\(...\)`:

```markdown
The model minimizes \(L(\theta)\) over the training set.
```

Centered equations use `$$...$$`:

```markdown
$$
L(\theta) = -\frac{1}{N}\sum_{i=1}^{N} y_i \log \hat{y}_i
$$
```

You can also write multi-line derivations:

```markdown
$$
\begin{aligned}
\mathcal{L}_{CE}
&= -\sum_{c=1}^{C} y_c \log p_c \\
p_c
&= \frac{\exp z_c}{\sum_{j=1}^{C} \exp z_j}
\end{aligned}
$$
```

For curriculum learning, a weighted loss might look like:

```markdown
$$
\mathcal{L}_{curriculum}(\theta, t)
= \sum_{i=1}^{N} w_i(t)\,\ell(f_\theta(x_i), y_i)
$$
```

The `topic` field is optional. Posts with the same topic are grouped together on
the blog page. If `topic` is omitted, the post appears under **Other notes**.

The homepage automatically displays the three newest posts by `date`. The full
archive is available at `/blog/`; there is no list or manifest to update.

## Fast local command

From any terminal, create a new post and open it in Obsidian:

```bash
blog-ahm My New Blog Title
```

To create it under a topic:

```bash
blog-ahm --topic "Curriculum Learning" Loss Functions for Curriculum Learning
```

Aliases also work:

```bash
blog-personal My New Blog Title
blog-ahmad My New Blog Title
```
