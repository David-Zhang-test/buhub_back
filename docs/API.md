## Complete API Endpoints Reference

### Authentication & User Management APIs

| Service | Method | Endpoint | Purpose | Auth Required |
|---------|--------|----------|---------|---------------|
| **Auth** | POST | `/api/auth/send-code` | Send verification code to email | No |
| | POST | `/api/auth/verify` | Verify code and return JWT token | No |
| | POST | `/api/auth/register` | Register with email & password | No |
| | POST | `/api/auth/login` | Login with email & password | No |
| | GET | `/api/auth/me` | Verify token & get current user (auto-login) | Yes |
| | POST | `/api/auth/profile-setup` | Setup user profile after verification | Yes |
| | PUT | `/api/auth/password` | Change password | Yes |
| | POST | `/api/auth/forgot-password` | Request password reset email | No |
| | POST | `/api/auth/reset-password` | Reset password with token | No |
| | POST | `/api/auth/logout` | Logout current session | Yes |
| **User** | GET | `/api/user/profile` | Get current user's full profile | Yes |
| | PUT | `/api/user/profile` | Update user profile (incl. language) | Yes |
| | GET | `/api/user/:userName` | Get public profile of another user | Optional |
| | GET | `/api/user/profile/content` | Get user's posts, comments, likes, stats | Yes |
| | GET | `/api/user/profile/following` | Get following list | Yes |
| | GET | `/api/user/profile/followers` | Get followers list | Yes |
| | POST | `/api/user/:userName/follow` | Follow/unfollow a user (toggle) | Yes |
| | POST | `/api/users/:userId/block` | Block a user | Yes |
| | DELETE | `/api/users/:userId/block` | Unblock a user | Yes |
| | GET | `/api/users/blocked` | Get my block list | Yes |
| | GET | `/api/users/search` | Search users by keyword | Optional |

### Forum & Content APIs

| Service | Method | Endpoint | Purpose | Auth Required |
|---------|--------|----------|---------|---------------|
| **Forum** | GET | `/api/forum/posts` | Get list of forum posts | Optional |
| | POST | `/api/forum/posts` | Create new post | Yes |
| | GET | `/api/forum/posts/:id` | Get single post detail | Optional |
| | PUT | `/api/forum/posts/:id` | Edit post (author only) | Yes |
| | DELETE | `/api/forum/posts/:id` | Delete post (author/admin) | Yes |
| | GET | `/api/forum/posts/:id/comments` | Get comments for a post | Optional |
| | POST | `/api/forum/posts/:id/comments` | Create comment on post | Yes |
| | POST | `/api/forum/posts/:id/like` | Like/unlike a post (toggle) | Yes |
| | POST | `/api/forum/posts/:id/bookmark` | Bookmark/unbookmark post (toggle) | Yes |
| | POST | `/api/forum/posts/:id/vote` | Vote on a poll option | Yes |
| | POST | `/api/forum/posts/:id/repost` | Repost to main forum | Yes |
| | GET | `/api/forum/search` | Search posts by query | Optional |
| | GET | `/api/forum/circles` | Get list of circles/tags | Optional |
| | GET | `/api/forum/circles/:tag` | Get posts in specific circle | Optional |
| **Comments** | PUT | `/api/comments/:id` | Edit comment (author only) | Yes |
| | DELETE | `/api/comments/:id` | Delete comment (author/admin) | Yes |
| | POST | `/api/comments/:id/like` | Like/unlike comment (toggle) | Yes |
| **Feed** | GET | `/api/feed` | Personalized home feed | Yes |
| | GET | `/api/feed/following` | Posts from followed users only | Yes |
| | GET | `/api/feed/trending` | Trending/popular content | Optional |

### Additional Features APIs

| Service | Method | Endpoint | Purpose | Auth Required |
|---------|--------|----------|---------|---------------|
| **Partner** | GET | `/api/partner` | Get partner posts (find activity partners) | Optional |
| | POST | `/api/partner` | Create partner post | Yes |
| | GET | `/api/partner/:id` | Get partner post detail | Optional |
| | PUT | `/api/partner/:id` | Edit partner post | Yes |
| | DELETE | `/api/partner/:id` | Delete partner post | Yes |
| | POST | `/api/partner/:id/join` | Join a partner request | Yes |
| **Errand** | GET | `/api/errands` | Get errands (run errands service) | Optional |
| | POST | `/api/errands` | Create errand request | Yes |
| | GET | `/api/errands/:id` | Get errand detail | Optional |
| | PUT | `/api/errands/:id` | Edit errand | Yes |
| | DELETE | `/api/errands/:id` | Delete errand | Yes |
| | POST | `/api/errands/:id/accept` | Accept an errand | Yes |
| **Marketplace** | GET | `/api/secondhand` | Get secondhand items | Optional |
| | POST | `/api/secondhand` | Create listing | Yes |
| | GET | `/api/secondhand/:id` | Get item detail | Optional |
| | PUT | `/api/secondhand/:id` | Edit listing | Yes |
| | DELETE | `/api/secondhand/:id` | Delete listing | Yes |
| | POST | `/api/secondhand/:id/want` | Express interest in item | Yes |
| **Rating** | GET | `/api/ratings/:category` | Get list of items to rate | Optional |
| | GET | `/api/ratings/:category/:id` | Get rating detail | Optional |
| | POST | `/api/ratings/:category/:id/rate` | Submit rating | Yes |
| | GET | `/api/ratings/:category/dimensions` | Get score dimensions | No |
| | GET | `/api/ratings/:category/tags` | Get available tags | No |

### Messaging & Notifications APIs

| Service | Method | Endpoint | Purpose | Auth Required |
|---------|--------|----------|---------|---------------|
| **Messaging** | GET | `/api/messages/conversations` | Get message contacts/conversations | Yes |
| | GET | `/api/messages/chat/:userId` | Get chat history with user | Yes |
| | POST | `/api/messages` | Send direct message | Yes |
| | PUT | `/api/messages/:id/read` | Mark message as read | Yes |
| | DELETE | `/api/messages/:id` | Delete message | Yes |
| | POST | `/api/follow` | Follow a user (for DM permissions) | Yes |
| | DELETE | `/api/follow/:userId` | Unfollow a user | Yes |
| **Notifications** | GET | `/api/notifications` | Get all notifications | Yes |
| | GET | `/api/notifications/likes` | Get like notifications | Yes |
| | GET | `/api/notifications/followers` | Get follower notifications | Yes |
| | GET | `/api/notifications/comments` | Get comment notifications | Yes |
| | GET | `/api/notifications/unread-count` | Get unread notification count | Yes |
| | PUT | `/api/notifications/:id/read` | Mark notification as read | Yes |
| | PUT | `/api/notifications/read-all` | Mark all as read | Yes |
| | POST | `/api/notifications/register-token` | Register push notification token | Yes |

### Reports & Moderation APIs

| Service | Method | Endpoint | Purpose | Auth Required |
|---------|--------|----------|---------|---------------|
| **Reports** | POST | `/api/reports` | Report post or comment | Yes |
| | GET | `/api/reports` | Get reports (admin only) | Yes (Admin) |
| | PUT | `/api/reports/:id/resolve` | Resolve report (admin) | Yes (Admin) |

### Upload & Media APIs

| Service | Method | Endpoint | Purpose | Auth Required |
|---------|--------|----------|---------|---------------|
| **Upload** | POST | `/api/upload/presigned-url` | Get presigned URL for file upload | Yes |
| | POST | `/api/upload/complete` | Notify upload completion (optional) | Yes |
| | DELETE | `/api/upload/:fileKey` | Delete uploaded file | Yes |

---

## API Summary Statistics

- **Total Endpoints**: 93
- **Authentication Endpoints**: 10
- **User Management**: 10
- **Forum & Content**: 18
- **Additional Features**: 20
- **Messaging**: 7
- **Notifications**: 8
- **Reports**: 3
- **Upload**: 3

**Authentication Types**:
- Public (No Auth): 17 endpoints
- User Auth Required: 73 endpoints
- Admin Only: 3 endpoints
