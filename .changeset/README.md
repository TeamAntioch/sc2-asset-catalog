# Changesets

Each pull request that changes what a package's users get adds a changeset: run `npx changeset`, pick the packages and the kind of change, and write a line for the changelog. On a push to `main`, the release workflow opens a version pull request from the changesets, and publishes to npm when that pull request is merged.
