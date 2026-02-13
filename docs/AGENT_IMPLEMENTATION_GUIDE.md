# BUHUB Backend Implementation Guide for AI Agents

## Project Overview
**Framework**: Next.js (App Router with API Routes)
**Database**: PostgreSQL with Prisma ORM
**Cache**: Redis
**File Storage**: OSS (Object Storage Service)
**Authentication**: JWT (Server-side Session)
**Vector Search**: Pinecone/Qdrant/Weaviate
**Push Notifications**: FCM + JPush (极光)
**Validation**: Zod Schema Validation

---

## BUHUB Frontend API Requirements Summary

**✅ VERIFIED AND ALIGNED WITH FRONTEND** - All modules, database schemas, and API endpoints have been updated to match the actual frontend requirements from the React Native mobile app.

Based on the analysis of the BUHUB mobile app (React Native), the following API services are **actively used** by the frontend and must be implemented:

### 1. Authentication Service (`auth.service.ts`)
**Endpoints Required:**
- `POST /auth/send-code` - Send verification code to email
- `POST /auth/verify` - Verify code and return JWT token
- `POST /auth/profile-setup` - Setup user profile after verification (nickname, grade, major, gender, bio)
- `POST /auth/logout` - Logout user

### 2. User Service (`user.service.ts`)
**Endpoints Required:**
- `GET /user/profile` - Get current user's profile
- `PUT /user/profile` - Update user profile
- `GET /user/:userName` - Get public profile of another user
- `GET /user/profile/content` - Get user's posts, comments, anonymous posts/comments, liked items, and stats
- `GET /user/profile/following` - Get list of users the current user is following
- `GET /user/profile/followers` - Get list of users following the current user
- `POST /user/:userName/follow` - Follow/unfollow a user

**User Profile Fields:**
```typescript
{ name, nickname, email, avatar, grade, major, bio, gender, isLoggedIn }
```

### 3. Forum Service (`forum.service.ts`)
**Endpoints Required:**
- `GET /forum/posts` - Get list of forum posts
- `GET /forum/posts/:id` - Get post detail
- `GET /forum/posts/:id/comments` - Get comments for a post
- `POST /forum/posts/:id/like` - Like/unlike a post
- `POST /forum/posts/:id/bookmark` - Bookmark/unbookmark a post
- `POST /forum/posts` - Create new post (with content, tags, isAnonymous, pollOptions)
- `GET /forum/search` - Search posts by query string
- `GET /forum/circles` - Get list of interest circles/tags
- `GET /forum/circles/:tag` - Get posts in a specific circle

**Post Fields:**
```typescript
{ id, avatar, name, gender, meta, createdAt, lang, content, likes, comments, tags, isAnonymous, pollOptions? }
```

### 4. Partner Service (`partner.service.ts`)
**Purpose:** Find partners for activities (travel, food, sports, courses, etc.)

**Endpoints Required:**
- `GET /partner` - Get list of partner posts (with optional category filter)
- `GET /partner/:id` - Get partner post detail
- `POST /partner` - Create new partner post
- `POST /partner/:id/join` - Join a partner request

**Categories:** `travel | food | course | sports | other`

**Partner Post Fields:**
```typescript
{ category, type, title, desc, time, location, user, avatar, gender, bio, expired, expiresAt, createdAt }
```

### 5. Errand Service (`errand.service.ts`)
**Purpose:** Request help for errands (pickup, buy items, other tasks)

**Endpoints Required:**
- `GET /errands` - Get list of errands (with optional category filter)
- `GET /errands/:id` - Get errand detail
- `POST /errands` - Create new errand
- `POST /errands/:id/accept` - Accept an errand request

**Categories:** `pickup | buy | other`

**Errand Fields:**
```typescript
{ category, type, title, desc, from, to, price, item, time, user, avatar, gender, bio, expired, expiresAt, createdAt }
```

### 6. Secondhand Service (`secondhand.service.ts`)
**Purpose:** Buy/sell secondhand items

**Endpoints Required:**
- `GET /secondhand` - Get list of items (with optional category filter)
- `GET /secondhand/:id` - Get item detail
- `POST /secondhand` - Create new listing
- `POST /secondhand/:id/want` - Express interest in an item

**Categories:** `electronics | books | furniture | other`

**Item Fields:**
```typescript
{ category, type, title, desc, price, condition, location, user, avatar, gender, bio, sold, expired, expiresAt, createdAt }
```

### 7. Rating Service (`rating.service.ts`)
**Purpose:** Rate courses, teachers, canteens, and majors

**Endpoints Required:**
- `GET /ratings/:category` - Get list of items to rate (course/teacher/canteen/major)
- `GET /ratings/:category/:id` - Get rating detail for specific item
- `POST /ratings/:category/:id/rate` - Submit rating (scores, tags, comment)
- `GET /ratings/:category/dimensions` - Get score dimensions for category
- `GET /ratings/:category/tags` - Get available tags for category

**Categories:** `course | teacher | canteen | major`

**Rating Fields (by category):**
```typescript
// Course
{ name, department, code, scores, tags, tagCounts, ratingCount, recentCount, scoreVariance }

// Teacher
{ name, department, email, scores, tags, tagCounts, ratingCount, recentCount, scoreVariance }

// Canteen
{ name, department, location, scores, tags, tagCounts, ratingCount, recentCount, scoreVariance }

// Major
{ name, department, scores, tags, tagCounts, ratingCount, recentCount, scoreVariance }
```

**Score Dimensions:** Multi-dimensional ratings (e.g., difficulty, workload, quality)

### 8. Message Service (`message.service.ts`)
**Purpose:** Direct messaging between users (WhatsApp-style)

**Endpoints Required:**
- `GET /messages/contacts` - Get list of message contacts
- `GET /messages/chat/:contactId` - Get chat history with a contact
- `POST /messages/chat/:contactId/send` - Send message to contact

**Contact Fields:**
```typescript
{ name, avatar, gender, lastMessage, time, unread }
```

**Message Fields:**
```typescript
{ sender, text, time, isMine }
```

### 9. Notification Service (`notification.service.ts`)
**Endpoints Required:**
- `GET /notifications/likes` - Get notifications for post/comment likes
- `GET /notifications/followers` - Get notifications for new followers
- `GET /notifications/comments` - Get notifications for comments on user's posts

**Notification Types:**
```typescript
// Like Notification
{ avatar, name, gender, action, postContent, time }

// Follower Notification
{ avatar, name, gender, time }

// Comment Notification
{ avatar, name, gender, postContent, comment, time }
```

---

## Important Implementation Notes

### Multi-Language Support
- All user-generated content should support language detection and translation
- Posts typically have fields: `lang` (tc/sc/en), `content`, and `translated` object with other languages
- Translation can be done async using services like Google Translate API

### Anonymous Posts
- Forum posts support `isAnonymous` flag
- When true, hide user identity but still associate with user in DB for moderation

### Time-based Expiration
- Partner, Errand, and Secondhand posts have `expired` and `expiresAt` fields
- Implement cron jobs or scheduled tasks to mark expired items

### User Metadata
- Users have profile fields: `grade` (e.g., "gradeUndergradY2"), `major` (e.g., "majorCS")
- These are likely enum values that should be defined in the frontend

### Engagement Features
- Posts can have likes, comments, bookmarks
- Users can follow other users
- Implement notification triggers for these actions

### Mock Data
- All frontend services currently use `USE_MOCK = true` with mock data
- Real backend should match the structure of mock data exactly

---

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
| | GET | `/api/messages/:userId` | Get chat history with user | Yes |
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

---


## Architecture Overview

```
/app
  /api                    - API route handlers (thin routing layer)
    /auth                 - Authentication routes
    /posts                - Forum post routes
    /comments             - Comment routes
    /users                - User profile routes
    /reports              - Report management routes
    /notifications        - Notification routes
    /search               - Search routes
    /additional           - Additional feature routes
/src
  /services               - Business logic layer
    /auth.service.ts      - Authentication logic
    /user.service.ts      - User operations
    /post.service.ts      - Post operations
    /comment.service.ts   - Comment operations
    /notification.service.ts
    /search.service.ts
    /report.service.ts
  /schemas                - Zod validation schemas
    /auth.schema.ts       - Auth request/response schemas
    /user.schema.ts       - User schemas
    /post.schema.ts       - Post schemas
    /comment.schema.ts    - Comment schemas
  /lib
    /db                   - Prisma client and utilities
    /redis                - Redis client and caching
    /auth                 - JWT utilities and session management
    /storage              - OSS integration
    /vector               - Vector search utilities
    /queue                - Background job queue
    /errors               - Custom error classes
  /middleware             - Next.js middleware for auth
  /types                  - TypeScript type definitions
  /utils                  - Helper functions
```

### Architecture Principles

1. **Routing Layer (`/app/api`)**: Thin route handlers that:
   - Validate requests using Zod schemas
   - Call service layer functions
   - Handle HTTP responses and error formatting
   - Manage authentication context

2. **Service Layer (`/src/services`)**: Business logic that:
   - Contains all business rules and logic
   - Interacts with database and external services
   - Returns domain objects (not HTTP responses)
   - Can be tested independently of HTTP layer

3. **Schema Layer (`/src/schemas`)**: Zod schemas for:
   - Request body validation
   - Query parameter validation
   - Response type safety
   - Shared data structures

---

## Module 1: User System (用户系统)

### Database Schema

```prisma
model User {
  id                String    @id @default(uuid())
  email             String?   @unique
  emailVerified     Boolean   @default(false)  // CRITICAL: Must verify before login

  name              String?   // Real name (optional)
  nickname          String
  avatar            String
  bio               String    @default("")  // User bio/description
  grade             String?   // e.g., "gradeUndergradY2", "gradePostgrad", etc.
  major             String?   // e.g., "majorCS", "majorBA", etc.
  gender            String    @default("other")  // 'male', 'female', 'other'
  role              Role      @default(USER)  // USER, ADMIN, MODERATOR
  language          String    @default("en")  // 'en', 'zh-CN', 'zh-TW' - user's preferred language
  isActive          Boolean   @default(true)  // false = deactivated account
  isBanned          Boolean   @default(false)

  agreedToTerms     Boolean   @default(false)
  agreedToTermsAt   DateTime?
  lastLoginAt       DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  

  posts             Post[]
  comments          Comment[]
  likes             Like[]
  reports           Report[]
  blockedUsers      Block[]   @relation("BlockedBy")
  blockedBy         Block[]   @relation("BlockedUser")
  notifications     Notification[]
  sentMessages      DirectMessage[]  @relation("MessageSender")
  receivedMessages  DirectMessage[]  @relation("MessageReceiver")
  following         Follow[]  @relation("Follower")
  followers         Follow[]  @relation("Following")
  partnerPosts      PartnerPost[]  // Partner posts created
  partnerJoins      PartnerJoin[]  // Partner posts joined
  errands           Errand[]       // Errands created
  errandAccepts     ErrandAccept[] // Errands accepted
  secondhandItems   SecondhandItem[]  // Items listed
  secondhandWants   SecondhandWant[]  // Items wanted
  ratings           Rating[]       // Ratings submitted
  bookmarks         Bookmark[]     // Bookmarked posts
  
  @@index([email])
  @@index([role])
  @@index([nickname])
}

model Block {
  id          String   @id @default(uuid())
  blockerId   String
  blockedId   String
  createdAt   DateTime @default(now())
  
  blocker     User     @relation("BlockedBy", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked     User     @relation("BlockedUser", fields: [blockedId], references: [id], onDelete: Cascade)
  
  @@unique([blockerId, blockedId])
  @@index([blockerId])
  @@index([blockedId])
}

// Direct messaging system (WhatsApp-style)
model DirectMessage {
  id            String   @id @default(uuid())
  senderId      String
  receiverId    String
  content       String   @db.Text
  images        String[] // Array of OSS URLs
  isRead        Boolean  @default(false)
  isDeleted     Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  sender        User     @relation("MessageSender", fields: [senderId], references: [id], onDelete: Cascade)
  receiver      User     @relation("MessageReceiver", fields: [receiverId], references: [id], onDelete: Cascade)
  
  @@index([senderId, receiverId])
  @@index([createdAt])
}

// Follow system for DM permissions
model Follow {
  id          String   @id @default(uuid())
  followerId  String
  followingId String
  createdAt   DateTime @default(now())
  
  follower    User     @relation("Follower", fields: [followerId], references: [id], onDelete: Cascade)
  following   User     @relation("Following", fields: [followingId], references: [id], onDelete: Cascade)
  
  @@unique([followerId, followingId])
  @@index([followerId])
  @@index([followingId])
}

```

### Zod Schemas

**File**: `/src/schemas/auth.schema.ts`

```typescript
import { z } from 'zod';

export const sendCodeSchema = z.object({
  email: z.string().email()
});

export const verifyCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6)
});

export const profileSetupSchema = z.object({
  nickname: z.string().min(2).max(50),
  grade: z.string(),
  major: z.string(),
  gender: z.enum(['male', 'female', 'other']),
  bio: z.string().max(500).optional()
});
```

**File**: `/src/schemas/user.schema.ts`

```typescript
import { z } from 'zod';

export const updateProfileSchema = z.object({
  nickname: z.string().min(2).max(50).optional(),
  avatar: z.string().optional(),
  grade: z.string().optional(),
  major: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  bio: z.string().max(500).optional()
});
```

### Service Layer

**File**: `/src/services/auth.service.ts`

```typescript
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { UnauthorizedError, ValidationError } from '@/lib/errors';

const JWT_EXPIRY = '7d'; // 7 days

export class AuthService {
  /**
   * Create JWT session token
   */
  async createSession(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const jti = crypto.randomUUID();
    const expiresIn = 7 * 24 * 60 * 60; // 7 days

    // Store session in Redis
    await redis.setex(
      `session:${jti}`,
      expiresIn,
      JSON.stringify({ userId, role: user.role, createdAt: Date.now() })
    );

    // Generate JWT
    const token = jwt.sign(
      { userId, jti, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: JWT_EXPIRY }
    );

    return { token };
  }

  /**
   * Verify JWT and check session in Redis
   */
  async verifySession(token: string) {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
      jti: string;
    };

    const sessionJson = await redis.get(`session:${decoded.jti}`);
    if (!sessionJson) throw new UnauthorizedError('Session expired');

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.isActive || user.isBanned) {
      throw new UnauthorizedError('Account disabled');
    }

    return { user };
  }

  /**
   * Logout - delete session
   */
  async logout(jti: string) {
    await redis.del(`session:${jti}`);
  }

  /**
   * Generate random profile for new users
   */
  async generateRandomProfile() {
    const avatars = ['avatar1.png', 'avatar2.png', 'avatar3.png'];
    const adjectives = ['Happy', 'Clever', 'Brave', 'Swift', 'Bright'];
    const nouns = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Phoenix'];
    
    return {
      avatar: avatars[Math.floor(Math.random() * avatars.length)],
      nickname: `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${Math.floor(Math.random() * 1000)}`
    };
  }
}

export const authService = new AuthService();
```

### API Endpoints

**Note**: Frontend uses simplified authentication flow with email verification codes, not traditional registration.

#### POST /api/auth/send-code
**Purpose**: Send verification code to email (for registration or login)

**Request Body**:
```typescript
{
  email: string;
}
```

**Response**:
```typescript
{
  success: true;
}
```

**Implementation Steps**:
1. Validate email format
2. Check if email is in temp-mail blocklist
3. Generate 6-digit verification code
4. Store in Redis with 10-minute TTL: `email_verify:{email}`
5. Send code via email
6. Return success (don't reveal if email exists or not)

**Route Handler** (`/app/api/auth/send-code/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { redis } from '@/lib/redis';
import { sendEmail } from '@/lib/email';
import { handleError } from '@/lib/errors';

const sendCodeSchema = z.object({
  email: z.string().email()
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = sendCodeSchema.parse(body);

    // Check temp-mail blocklist
    if (await isTempMail(email)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_EMAIL', message: 'Temporary emails not allowed' } },
        { status: 400 }
      );
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in Redis with 10-minute TTL
    await redis.setex(`email_verify:${email}`, 600, code);

    // Send email with code
    await sendEmail({
      to: email,
      subject: 'BUHUB Verification Code',
      text: `Your verification code is: ${code}. Valid for 10 minutes.`
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
```

#### POST /api/auth/verify
**Purpose**: Verify email code and login/register user

**Request Body**:
```typescript
{
  email: string;
  code: string;
}
```

**Response**:
```typescript
{
  success: true;
  token: string;  // JWT token
}
```

**Implementation Steps**:
1. Verify code from Redis
2. Check if user exists with this email
3. If user exists: Login (create session, return token)
4. If new user: Create account with default profile, return token
5. Delete code from Redis
6. User completes profile setup in next step

**Route Handler** (`/app/api/auth/verify/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { redis } from '@/lib/redis';
import { prisma } from '@/lib/db';
import { authService } from '@/services/auth.service';
import { handleError } from '@/lib/errors';

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6)
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, code } = verifySchema.parse(body);

    // Check code from Redis
    const storedCode = await redis.get(`email_verify:${email}`);
    if (!storedCode || storedCode !== code) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_CODE', message: 'Invalid or expired verification code' } },
        { status: 400 }
      );
    }

    // Delete code
    await redis.del(`email_verify:${email}`);

    // Check if user exists
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Create new user with default profile
      const { avatar, nickname } = await authService.generateRandomProfile();
      
      user = await prisma.user.create({
        data: {
          email,
          emailVerified: true,
          nickname,
          avatar,
          agreedToTerms: true,
          agreedToTermsAt: new Date(),
          accounts: {
            create: {
              type: 'email',
              provider: 'email',
              providerAccountId: email
            }
          }
        }
      });
    }

    // Check account status
    if (!user.isActive || user.isBanned) {
      return NextResponse.json(
        { success: false, error: { code: 'ACCOUNT_DISABLED', message: 'Account is disabled' } },
        { status: 403 }
      );
    }

    // Create session and generate JWT
    const { token } = await authService.createSession(user.id);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    return NextResponse.json({
      success: true,
      token
    });
  } catch (error) {
    return handleError(error);
  }
}
```

#### POST /api/auth/profile-setup
**Purpose**: Complete user profile after registration/login

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```typescript
{
  nickname: string;
  grade: string;  // e.g., "gradeUndergradY2"
  major: string;  // e.g., "majorCS"
  gender: 'male' | 'female' | 'other';
  bio?: string;
  language?: 'en' | 'zh-CN' | 'zh-TW';  // User's preferred language
}
```

**Response**:
```typescript
{
  success: true;
}
```

**Implementation Steps**:
1. Get user ID from token
2. Update user profile with provided fields
3. Return success

**Route Handler** (`/app/api/auth/profile-setup/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { handleError } from '@/lib/errors';

const profileSetupSchema = z.object({
  nickname: z.string().min(2).max(50),
  grade: z.string(),
  major: z.string(),
  gender: z.enum(['male', 'female', 'other']),
  bio: z.string().max(500).optional()
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const data = profileSetupSchema.parse(body);

    // Update profile
    await prisma.user.update({
      where: { id: user.id },
      data: {
        nickname: data.nickname,
        grade: data.grade,
        major: data.major,
        gender: data.gender,
        bio: data.bio || '',
        language: data.language || 'en'
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
```



#### GET /api/auth/me
**Purpose**: Verify token and get current user info (for auto-login)

**Headers**: `Authorization: Bearer <token>`

**Response**:
```typescript
{
  success: true;
  data: {
    id: string;
    email: string;
    nickname: string;
    avatar: string;
    language: string;
  }
}
```

**Route Handler** (`/app/api/auth/me/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { handleError } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    
    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        avatar: user.avatar,
        language: user.language
      }
    });
  } catch (error) {
    return handleError(error);
  }
}
```

#### POST /api/auth/register
**Purpose**: Register with email and password

**Request Body**:
```typescript
{
  email: string;
  password: string;
  nickname: string;
  language?: 'en' | 'zh-CN' | 'zh-TW';
}
```

**Response**:
```typescript
{
  success: true;
  message: string;  // "Verification email sent"
}
```

**Route Handler** (`/app/api/auth/register/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authService } from '@/services/auth.service';
import { handleError } from '@/lib/errors';
import bcrypt from 'bcrypt';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  nickname: z.string().min(2).max(50),
  language: z.enum(['en', 'zh-CN', 'zh-TW']).optional()
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, nickname, language } = registerSchema.parse(body);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: { code: 'EMAIL_EXISTS', message: 'Email already registered' } },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate random avatar
    const { avatar } = await authService.generateRandomProfile();

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        nickname,
        avatar,
        language: language || 'en',
        emailVerified: false,
        agreedToTerms: true,
        agreedToTermsAt: new Date(),
        accounts: {
          create: {
            type: 'email',
            provider: 'email',
            providerAccountId: email
          }
        }
      }
    });

    // Create verification token
    const token = await authService.createVerificationToken(user.id, 'email_verification');

    // Send verification email
    await authService.sendVerificationEmail(email, token);

    return NextResponse.json({
      success: true,
      message: 'Registration successful. Please check your email to verify your account.'
    });
  } catch (error) {
    return handleError(error);
  }
}
```

#### POST /api/auth/login
**Purpose**: Login with email and password

**Request Body**:
```typescript
{
  email: string;
  password: string;
}
```

**Response**:
```typescript
{
  success: true;
  token: string;  // JWT token
}
```

**Route Handler** (`/app/api/auth/login/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authService } from '@/services/auth.service';
import { handleError } from '@/lib/errors';
import bcrypt from 'bcrypt';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = loginSchema.parse(body);

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
        { status: 401 }
      );
    }

    // Check email verified
    if (!user.emailVerified) {
      return NextResponse.json(
        { success: false, error: { code: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email first' } },
        { status: 403 }
      );
    }

    // Check account status
    if (!user.isActive || user.isBanned) {
      return NextResponse.json(
        { success: false, error: { code: 'ACCOUNT_DISABLED', message: 'Account is disabled' } },
        { status: 403 }
      );
    }

    // Create session and generate JWT
    const { token } = await authService.createSession(user.id);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    return NextResponse.json({
      success: true,
      token
    });
  } catch (error) {
    return handleError(error);
  }
}
```

#### PUT /api/auth/password
**Purpose**: Change password (when user is logged in)

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```typescript
{
  oldPassword: string;
  newPassword: string;
}
```

**Response**:
```typescript
{
  success: true;
  message: string;
}
```

**Route Handler** (`/app/api/auth/password/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { authService } from '@/services/auth.service';
import { handleError } from '@/lib/errors';
import bcrypt from 'bcrypt';

const changePasswordSchema = z.object({
  oldPassword: z.string(),
  newPassword: z.string().min(8).max(100)
});

export async function PUT(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const { oldPassword, newPassword } = changePasswordSchema.parse(body);

    // Get user with password hash
    const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!fullUser || !fullUser.passwordHash) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_PASSWORD', message: 'Account has no password set' } },
        { status: 400 }
      );
    }

    // Verify old password
    const isValidPassword = await bcrypt.compare(oldPassword, fullUser.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' } },
        { status: 401 }
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });

    // Logout all other sessions (optional security measure)
    await authService.logoutAllSessions(user.id);

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    return handleError(error);
  }
}
```

#### POST /api/auth/forgot-password
**Purpose**: Request password reset email

**Request Body**:
```typescript
{
  email: string;
}
```

**Response**:
```typescript
{
  success: true;
  message: string;  // "Password reset email sent"
}
```

**Route Handler** (`/app/api/auth/forgot-password/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authService } from '@/services/auth.service';
import { handleError } from '@/lib/errors';

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = forgotPasswordSchema.parse(body);

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { email } });
    
    // Always return success (don't reveal if email exists)
    if (!user) {
      return NextResponse.json({
        success: true,
        message: 'If your email is registered, you will receive a password reset link'
      });
    }

    // Create password reset token
    const token = await authService.createVerificationToken(user.id, 'password_reset');

    // Send reset email
    await authService.sendPasswordResetEmail(email, token);

    return NextResponse.json({
      success: true,
      message: 'If your email is registered, you will receive a password reset link'
    });
  } catch (error) {
    return handleError(error);
  }
}
```

#### POST /api/auth/reset-password
**Purpose**: Reset password with token from email

**Request Body**:
```typescript
{
  token: string;
  newPassword: string;
}
```

**Response**:
```typescript
{
  success: true;
  message: string;
}
```

**Route Handler** (`/app/api/auth/reset-password/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authService } from '@/services/auth.service';
import { handleError } from '@/lib/errors';
import bcrypt from 'bcrypt';

const resetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8).max(100)
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, newPassword } = resetPasswordSchema.parse(body);

    // Verify token
    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token }
    });

    if (!verificationToken || verificationToken.type !== 'password_reset') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } },
        { status: 400 }
      );
    }

    // Check expiry
    if (new Date() > verificationToken.expiresAt) {
      await prisma.verificationToken.delete({ where: { token } });
      return NextResponse.json(
        { success: false, error: { code: 'TOKEN_EXPIRED', message: 'Reset link has expired' } },
        { status: 400 }
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: verificationToken.userId },
      data: { passwordHash }
    });

    // Delete token
    await prisma.verificationToken.delete({ where: { token } });

    // Logout all sessions
    await authService.logoutAllSessions(verificationToken.userId);

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    return handleError(error);
  }
}
```

#### POST /api/auth/logout
**Purpose**: Invalidate current session

**Headers**: `Authorization: Bearer <token>`

**Route Handler** (`/app/api/auth/logout/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/services/auth.service';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { session } = await getCurrentUser(req);
    
    // Delete session from database
    await authService.logout(session.token);

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    return handleError(error);
  }
}
```

**Implementation Notes**:
1. Verifies JWT from Authorization header
2. Deletes session record from database using jti
3. No need for token blacklist - session validation happens on each request
4. Future requests with same token will fail (session not found)

#### PUT /api/user/profile
**Purpose**: Update user profile

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```typescript
{
  nickname?: string;
  avatar?: string;  // Image URL or data
  grade?: string;
  major?: string;
  bio?: string;
  gender?: 'male' | 'female' | 'other';
}
```

**Implementation Steps**:
1. Get user ID from token
2. Validate and sanitize input fields
3. Update user record in database
4. Return success

#### GET /api/user/profile
**Purpose**: Get current user's full profile

**Headers**: `Authorization: Bearer <token>`

**Response**:
```typescript
{
  success: true,
  data: {
    name: string;
    nickname: string;
    email: string;
    avatar: string | null;
    grade: string;  // e.g., "gradeUndergradY2"
    major: string;  // e.g., "majorCS"
    bio: string;
    gender: 'male' | 'female' | 'other';
    isLoggedIn: boolean;
    isHKBUVerified: boolean;
    hkbuEmail?: string;
  }
}
```

**Implementation Steps**:
1. Get user ID from JWT token
2. Fetch user from database with all profile fields
3. Return sanitized user data (exclude sensitive fields like passwordHash)

#### GET /api/user/:userName
**Purpose**: Get public profile of another user

**Response**:
```typescript
{
  success: true,
  data: {
    userName: string;
    nickname: string;
    avatar: string;
    gender: 'male' | 'female' | 'other';
    bio: string;
    grade: string;
    major: string;
    isHKBUVerified: boolean;
    stats: {
      postCount: number;
      followerCount: number;
      followingCount: number;
    };
    isFollowedByMe: boolean;  // For logged-in users
  }
}
```

**Implementation Steps**:
1. Fetch user by username
2. Check if blocked relationship exists (both directions)
3. If blocked, return error or limited data
4. Calculate stats (count posts, followers, following)
5. If viewer is logged in, check if they follow this user
6. Return public profile data

#### GET /api/user/profile/content
**Purpose**: Get current user's content (posts, comments, likes, wants, stats)

**Headers**: `Authorization: Bearer <token>`

**Response**:
```typescript
{
  success: true,
  data: {
    posts: Post[];           // User's posts
    comments: Comment[];     // User's comments
    anonPosts: Post[];       // User's anonymous posts
    anonComments: Comment[]; // User's anonymous comments
    myLikes: {
      posts: LikedPost[];
      comments: LikedComment[];
    };
    myWants: WantedItem[];  // From secondhand marketplace
    stats: {
      following: number;
      followers: number;
      collection: number;  // Bookmarked posts
    };
  }
}
```

**Implementation Steps**:
1. Get user ID from token
2. Fetch all posts by user (include anonymous flag)
3. Fetch all comments by user
4. Fetch all likes (posts and comments)
5. Fetch all secondhand wants
6. Calculate stats (count following, followers, bookmarks)
7. Return comprehensive user content

#### GET /api/user/profile/following
**Purpose**: Get list of users the current user is following

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:
- `page?: number` - Page number (default: 1)
- `limit?: number` - Items per page (default: 20)

**Response**:
```typescript
{
  success: true,
  data: {
    userName: string;
    avatar: string;
    gender: 'male' | 'female' | 'other';
    bio: string;
    isFollowed: true;  // Always true for following list
  }[]
}
```

**Implementation Steps**:
1. Get user ID from token
2. Query Follow table where followerId = userId
3. Join with User table to get follower details
4. Return paginated list

#### GET /api/user/profile/followers
**Purpose**: Get list of users following the current user

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:
- `page?: number`
- `limit?: number`

**Response**:
```typescript
{
  success: true,
  data: {
    userName: string;
    avatar: string;
    gender: 'male' | 'female' | 'other';
    bio: string;
    isFollowed: boolean;  // True if current user follows them back
  }[]
}
```

**Implementation Steps**:
1. Get user ID from token
2. Query Follow table where followingId = userId
3. For each follower, check if current user follows them back
4. Return paginated list with mutual follow status

#### POST /api/user/:userName/follow
**Purpose**: Follow or unfollow a user (toggle)

**Headers**: `Authorization: Bearer <token>`

**Response**:
```typescript
{
  success: true,
  data: {
    followed: boolean;  // True if now following, false if unfollowed
  }
}
```

**Implementation Steps**:
1. Get current user ID from token
2. Get target user ID from username
3. Check if Follow record exists
4. If exists: Delete record (unfollow)
5. If not exists: Create record (follow)
6. If following: Create notification for target user
7. Return new follow status

#### POST /api/users/:userId/block
**Purpose**: Block a user

**Headers**: `Authorization: Bearer <token>`

**Response**:
```typescript
{
  success: true;
  message: string;
}
```

**Route Handler** (`/app/api/users/[userId]/block/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { handleError } from '@/lib/errors';

export async function POST(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { user } = await getCurrentUser(req);
    const targetUserId = params.userId;

    // Can't block yourself
    if (user.id === targetUserId) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_TARGET', message: 'Cannot block yourself' } },
        { status: 400 }
      );
    }

    // Check if already blocked
    const existing = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: user.id,
          blockedId: targetUserId
        }
      }
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        message: 'User already blocked'
      });
    }

    // Create block record
    await prisma.block.create({
      data: {
        blockerId: user.id,
        blockedId: targetUserId
      }
    });

    // Clear block list cache
    await redis.del(`user:${user.id}:blocked`);

    // Unfollow each other if following
    await prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: user.id, followingId: targetUserId },
          { followerId: targetUserId, followingId: user.id }
        ]
      }
    });

    return NextResponse.json({
      success: true,
      message: 'User blocked successfully'
    });
  } catch (error) {
    return handleError(error);
  }
}
```

#### DELETE /api/users/:userId/block
**Purpose**: Unblock a user

**Headers**: `Authorization: Bearer <token>`

**Response**:
```typescript
{
  success: true;
  message: string;
}
```

**Route Handler** (`/app/api/users/[userId]/block/route.ts`):
```typescript
export async function DELETE(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { user } = await getCurrentUser(req);
    const targetUserId = params.userId;

    // Delete block record
    await prisma.block.deleteMany({
      where: {
        blockerId: user.id,
        blockedId: targetUserId
      }
    });

    // Clear block list cache
    await redis.del(`user:${user.id}:blocked`);

    return NextResponse.json({
      success: true,
      message: 'User unblocked successfully'
    });
  } catch (error) {
    return handleError(error);
  }
}
```

#### GET /api/users/blocked
**Purpose**: Get current user's block list

**Headers**: `Authorization: Bearer <token>`

**Response**:
```typescript
{
  success: true;
  data: {
    id: string;
    nickname: string;
    avatar: string;
    blockedAt: string;
  }[]
}
```

**Route Handler** (`/app/api/users/blocked/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { handleError } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);

    const blocked = await prisma.block.findMany({
      where: { blockerId: user.id },
      include: {
        blocked: {
          select: {
            id: true,
            nickname: true,
            avatar: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      success: true,
      data: blocked.map(b => ({
        id: b.blocked.id,
        nickname: b.blocked.nickname,
        avatar: b.blocked.avatar,
        blockedAt: b.createdAt.toISOString()
      }))
    });
  } catch (error) {
    return handleError(error);
  }
}
```

#### GET /api/users/search
**Purpose**: Search users by keyword (nickname or email)

**Query Parameters**:
```typescript
{
  q: string;  // Search query
  page?: number;
  limit?: number;
}
```

**Response**:
```typescript
{
  success: true;
  data: {
    id: string;
    nickname: string;
    avatar: string;
    grade: string;
    major: string;
    bio: string;
    isFollowed?: boolean;  // If user is logged in
  }[]
}
```

**Route Handler** (`/app/api/users/search/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { handleError } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!query || query.length < 2) {
      return NextResponse.json({
        success: false,
        error: { code: 'QUERY_TOO_SHORT', message: 'Search query must be at least 2 characters' }
      }, { status: 400 });
    }

    // Get current user if logged in (optional)
    let currentUserId: string | null = null;
    try {
      const { user } = await getCurrentUser(req);
      currentUserId = user.id;
    } catch (e) {
      // Not logged in, continue without user context
    }

    // Search users by nickname or email
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { nickname: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } }
        ],
        isActive: true,
        isBanned: false
      },
      select: {
        id: true,
        nickname: true,
        avatar: true,
        grade: true,
        major: true,
        bio: true
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { nickname: 'asc' }
    });

    // If user is logged in, check follow status
    let followedUserIds: string[] = [];
    if (currentUserId) {
      const follows = await prisma.follow.findMany({
        where: {
          followerId: currentUserId,
          followingId: { in: users.map(u => u.id) }
        },
        select: { followingId: true }
      });
      followedUserIds = follows.map(f => f.followingId);
    }

    return NextResponse.json({
      success: true,
      data: users.map(user => ({
        ...user,
        isFollowed: currentUserId ? followedUserIds.includes(user.id) : undefined
      }))
    });
  } catch (error) {
    return handleError(error);
  }
}
```

#### GET /api/feed
**Purpose**: Get personalized home feed (followed users + recommended content)

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:
```typescript
{
  page?: number;
  limit?: number;
  sortBy?: 'recent' | 'popular';
}
```

**Response**:
```typescript
{
  success: true;
  data: Post[]  // Same structure as forum posts
}
```

**Route Handler** (`/app/api/feed/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { handleError } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const sortBy = searchParams.get('sortBy') || 'recent';

    // Get followed user IDs
    const following = await prisma.follow.findMany({
      where: { followerId: user.id },
      select: { followingId: true }
    });
    const followedUserIds = following.map(f => f.followingId);

    // Get blocked user IDs (exclude their posts)
    const cacheKey = `user:${user.id}:blocked`;
    let blockedUserIds: string[] = await redis.get(cacheKey) || [];
    
    if (blockedUserIds.length === 0) {
      const blocked = await prisma.block.findMany({
        where: {
          OR: [
            { blockerId: user.id },
            { blockedId: user.id }
          ]
        },
        select: { blockedId: true, blockerId: true }
      });
      blockedUserIds = [
        ...blocked.filter(b => b.blockerId === user.id).map(b => b.blockedId),
        ...blocked.filter(b => b.blockedId === user.id).map(b => b.blockerId)
      ];
      await redis.setex(cacheKey, 300, JSON.stringify(blockedUserIds));
    }

    // Build query
    const whereClause: any = {
      isDeleted: false,
      authorId: { notIn: blockedUserIds }
    };

    // If user follows people, show their posts + recommended
    // Otherwise show all (new user experience)
    if (followedUserIds.length > 0) {
      whereClause.OR = [
        { authorId: { in: followedUserIds } },  // Followed users
        { likeCount: { gte: 10 } }  // Popular posts (recommendation)
      ];
    }

    // Fetch posts
    const posts = await prisma.post.findMany({
      where: whereClause,
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
            gender: true,
            grade: true,
            major: true
          }
        },
        pollOptions: {
          include: {
            votes: true
          }
        }
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: sortBy === 'popular' 
        ? [{ likeCount: 'desc' }, { createdAt: 'desc' }]
        : { createdAt: 'desc' }
    });

    return NextResponse.json({
      success: true,
      data: posts
    });
  } catch (error) {
    return handleError(error);
  }
}
```

#### GET /api/feed/following
**Purpose**: Get posts from followed users only

**Headers**: `Authorization: Bearer <token>`

**Route Handler**: Similar to `/api/feed` but only include posts where `authorId IN followedUserIds`

#### GET /api/feed/trending
**Purpose**: Get trending/popular content

**Query Parameters**:
```typescript
{
  timeframe?: '24h' | '7d' | '30d';  // Default: 7d
  page?: number;
  limit?: number;
}
```

**Response**: Posts sorted by engagement score (likes + comments + views weighted by recency)

**Route Handler** (`/app/api/feed/trending/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleError } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const timeframe = searchParams.get('timeframe') || '7d';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Calculate date threshold
    const now = new Date();
    const hoursAgo = timeframe === '24h' ? 24 : timeframe === '7d' ? 168 : 720;
    const threshold = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

    // Fetch trending posts
    const posts = await prisma.post.findMany({
      where: {
        isDeleted: false,
        createdAt: { gte: threshold }
      },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
            gender: true
          }
        },
        pollOptions: {
          include: { votes: true }
        }
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [
        { likeCount: 'desc' },
        { commentCount: 'desc' },
        { viewCount: 'desc' }
      ]
    });

    return NextResponse.json({
      success: true,
      data: posts
    });
  } catch (error) {
    return handleError(error);
  }
}
```

---

## Module 2: Forum System (论坛系统)

### Database Schema

```prisma
model Post {
  id            String     @id @default(uuid())
  authorId      String
  postType      String     @default("image-text")  // 'image-text', 'text', 'poll'
  content       String     @db.Text
  images        String[]   // Array of OSS URLs
  viewCount     Int        @default(0)
  likeCount     Int        @default(0)
  commentCount  Int        @default(0)
  tags          String[]
  category      String?    // 'forum', 'find-partner', 'run-errands', 'marketplace', 'ratings'
  isRepost      Boolean    @default(false)  // True if reposted from additional features to forum
  originalPostId String?   // Reference to original post if this is a repost
  isDeleted     Boolean    @default(false)
  
  // Poll-specific fields (only for postType='poll')
  pollOptions   PollOption[]  @relation("PostPollOptions")
  pollEndDate   DateTime?
  
  // Find Partner fields (category='find-partner')
  partnerType   String?    // 'study', 'exercise', 'travel', 'hobby', etc.
  eventEndDate  DateTime?
  
  // Run Errands fields (category='run-errands')
  price         Float?
  errandType    String?    // 'delivery', 'shopping', 'queuing', etc.
  startAddress  String?
  endAddress    String?
  taskEndTime   DateTime?
  
  // Marketplace fields (category='marketplace')
  itemPrice     Float?
  itemLocation  String?
  saleEndTime   DateTime?
  itemStatus    String?    @default("available")  // 'available', 'sold', 'reserved'
  
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
  
  author        User       @relation(fields: [authorId], references: [id], onDelete: Cascade)
  comments      Comment[]
  likes         Like[]
  bookmarks     Bookmark[]
  reports       Report[]
  votes         Vote[]     @relation("PostVotes")
  
  @@index([authorId])
  @@index([createdAt])
  @@index([category])
  @@index([postType])
}

model Bookmark {
  id        String   @id @default(uuid())
  userId    String
  postId    String
  createdAt DateTime @default(now())
  
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  
  @@unique([userId, postId])
  @@index([userId])
  @@index([postId])
}

model Comment {
  id            String     @id @default(uuid())
  postId        String
  authorId      String
  content       String     @db.Text
  parentId      String?    // For second-level comments
  likeCount     Int        @default(0)
  isDeleted     Boolean    @default(false)
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
  
  post          Post       @relation(fields: [postId], references: [id], onDelete: Cascade)
  author        User       @relation(fields: [authorId], references: [id], onDelete: Cascade)
  parent        Comment?   @relation("CommentReplies", fields: [parentId], references: [id], onDelete: Cascade)
  replies       Comment[]  @relation("CommentReplies")
  likes         Like[]
  reports       Report[]
  
  @@index([postId])
  @@index([authorId])
  @@index([parentId])
}

model Like {
  id          String   @id @default(uuid())
  userId      String
  postId      String?
  commentId   String?
  createdAt   DateTime @default(now())
  
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  post        Post?    @relation(fields: [postId], references: [id], onDelete: Cascade)
  comment     Comment? @relation(fields: [commentId], references: [id], onDelete: Cascade)
  
  @@unique([userId, postId])
  @@unique([userId, commentId])
  @@index([postId])
  @@index([commentId])
}

model Tag {
  id        String   @id @default(uuid())
  name      String   @unique
  usageCount Int     @default(0)
  createdAt DateTime @default(now())
  
  @@index([name])
}

model Report {
  id          String   @id @default(uuid())
  reporterId  String
  postId      String?
  commentId   String?
  reason      String
  snapshot    Json     // Store content snapshot
  status      String   @default("pending") // 'pending', 'reviewed', 'resolved'
  createdAt   DateTime @default(now())
  
  reporter    User     @relation(fields: [reporterId], references: [id], onDelete: Cascade)
  post        Post?    @relation(fields: [postId], references: [id], onDelete: SetNull)
  comment     Comment? @relation(fields: [commentId], references: [id], onDelete: SetNull)
  
  @@index([reporterId])
  @@index([postId])
  @@index([commentId])
  @@index([status])
}
```

### API Endpoints

#### POST /api/posts
**Purpose**: Create a new post (forum, poll, or additional features)

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```typescript
{
  postType: 'image-text' | 'text' | 'poll';  // Required
  content: string;
  images?: string[];  // OSS URLs (already uploaded)
  tags?: string[];
  category: 'forum' | 'find-partner' | 'run-errands' | 'marketplace' | 'ratings';
  
  // Poll-specific (required if postType='poll')
  pollOptions?: string[];  // Array of option texts
  pollEndDate?: Date;
  
  // Find Partner specific (required if category='find-partner')
  partnerType?: 'study' | 'exercise' | 'travel' | 'hobby' | 'dining' | 'other';
  eventEndDate?: Date;
  
  // Run Errands specific (required if category='run-errands')
  price?: number;
  errandType?: 'delivery' | 'shopping' | 'queuing' | 'pickup' | 'other';
  startAddress?: string;
  endAddress?: string;
  taskEndTime?: Date;
  
  // Marketplace specific (required if category='marketplace')
  itemPrice?: number;
  itemLocation?: string;
  saleEndTime?: Date;  // Optional expiry time for listing
}
```

**Implementation Steps**:
1. Validate postType and category combination
2. Sanitize content (remove dangerous HTML tags, XSS prevention)
3. Validate images are from trusted OSS domain
4. If postType='poll':
   - Validate pollOptions (2-10 options)
   - Create Post with PollOption records
5. If category-specific fields:
   - Validate required fields for category
   - Set appropriate fields (price, dates, addresses, etc.)
6. Create post record with all fields
7. Update tag usage counts
8. Trigger async job to generate vector embedding
9. Return post object with all details

#### POST /api/posts/upload-image
**Purpose**: Get presigned URL for image upload

**Headers**: `Authorization: Bearer <accessToken>`

**Request Body**:
```typescript
{
  fileName: string;
  fileSize: number;
  mimeType: string;
}
```

**Implementation Steps**:
1. Validate file type (jpg, png, gif, webp)
2. Validate file size (max 10MB)
3. Generate unique filename
4. Create presigned OSS upload URL
5. Return upload URL and final URL

**Client-side flow**:
1. Compress image in browser/app
2. Get presigned URL from backend
3. Upload directly to OSS
4. Include final URL in post creation

#### GET /api/posts
**Purpose**: Get paginated posts

**Query Parameters**:
```typescript
{
  page?: number;
  limit?: number;
  category?: string;
  tags?: string[];
  sortBy?: 'recent' | 'popular' | 'trending';
}
```

**Implementation Steps**:
1. Get current user's blocked list from Redis (cache for 5 min)
2. Query posts with pagination
3. Filter out posts from blocked users
4. Return posts with author info (sanitized)

#### GET /api/posts/:id
**Purpose**: Get single post with details

**Implementation Steps**:
1. Fetch post with author, comments, likes
2. Check if viewer has blocked or been blocked by author
3. Increment view count:
   - Store in Redis: `post:views:{postId}` (increment)
   - Schedule async job to batch update DB every 5 minutes
4. Return post data with user's like status

#### PUT /api/posts/:id
**Purpose**: Edit post (author only)

**Headers**: `Authorization: Bearer <accessToken>`

**Request Body**:
```typescript
{
  content?: string;
  images?: string[];
  tags?: string[];
}
```

#### DELETE /api/posts/:id
**Purpose**: Delete post (author or admin)

**Implementation Steps**:
1. Soft delete: set `isDeleted = true`
2. Keep data for moderation/audit
3. Remove from vector search index

#### POST /api/posts/:id/like
**Purpose**: Like a post

**Headers**: `Authorization: Bearer <accessToken>`

**Implementation Steps**:
1. Check if already liked (prevent duplicates)
2. Create Like record
3. Increment Redis counter: `post:likes:{postId}`
4. Async update DB like count
5. Create notification for post author

#### DELETE /api/posts/:id/like
**Purpose**: Unlike a post

**Implementation Steps**:
1. Delete Like record
2. Decrement Redis counter
3. Async update DB

#### GET /api/posts/:id/comments
**Purpose**: Get comments for a post

**Query Parameters**:
```typescript
{
  page?: number;
  limit?: number;
  sortBy?: 'recent' | 'popular';
}
```

**Implementation Steps**:
1. Fetch top-level comments (parentId = null)
2. For each top-level comment, fetch replies (2-level structure)
3. Filter blocked users
4. Return nested structure

#### POST /api/comments
**Purpose**: Create a comment

**Headers**: `Authorization: Bearer <accessToken>`

**Request Body**:
```typescript
{
  postId: string;
  content: string;
  parentId?: string;  // For second-level replies
}
```

**Implementation Steps**:
1. Sanitize content
2. Validate parent comment exists (if replying)
3. Create comment record
4. Increment post comment count (Redis + async DB)
5. Create notification for post author or parent comment author
6. Trigger vector embedding job

#### DELETE /api/comments/:id
**Purpose**: Delete comment

**Implementation Steps**:
1. If top-level comment (parentId = null):
   - Soft delete comment
   - Cascade delete all replies (set isDeleted = true)
2. If second-level comment:
   - Simply soft delete the comment
3. Decrement post comment count

#### POST /api/comments/:id/like
**Purpose**: Like a comment

#### DELETE /api/comments/:id/like
**Purpose**: Unlike a comment

#### GET /api/forum/posts
**Purpose**: Get list of forum posts with author info

**Query Parameters**:
- `page?: number` - Page number (default: 1)
- `limit?: number` - Items per page (default: 20)
- `sortBy?: 'recent' | 'popular'` - Sort order

**Response**:
```typescript
{
  success: true,
  data: {
    id: string;
    avatar: string;
    name: string;
    gender: 'male' | 'female' | 'other';
    meta: string;  // User metadata (grade, major, etc.)
    createdAt: string;  // ISO date string
    lang: 'tc' | 'sc' | 'en';
    content: string;
    translated?: {
      sc?: string;
      tc?: string;
      en?: string;
    };
    likes: number;
    comments: number;
    tags?: string[];
    isAnonymous?: boolean;
    pollOptions?: string[];
  }[]
}
```

**Implementation Steps**:
1. Query posts from database with pagination
2. Join with user data to get author info
3. If anonymous, replace author info with "匿名用户"
4. Include translation metadata if available
5. Return formatted post list

#### POST /api/forum/posts/:id/bookmark
**Purpose**: Bookmark or unbookmark a post (toggle)

**Headers**: `Authorization: Bearer <token>`

**Response**:
```typescript
{
  success: true,
  data: {
    bookmarked: boolean;  // True if now bookmarked, false if removed
  }
}
```

**Implementation Steps**:
1. Check if Bookmark record exists for user + post
2. If exists: Delete (unbookmark)
3. If not exists: Create (bookmark)
4. Return new bookmark status

**Note**: Need to add Bookmark model to database schema:
```prisma
model Bookmark {
  id        String   @id @default(uuid())
  userId    String
  postId    String
  createdAt DateTime @default(now())
  
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  
  @@unique([userId, postId])
  @@index([userId])
  @@index([postId])
}
```

#### GET /api/forum/search
**Purpose**: Search forum posts by query string

**Query Parameters**:
- `q: string` - Search query
- `page?: number`
- `limit?: number`

**Response**:
```typescript
{
  success: true,
  data: ForumPost[]  // Same structure as GET /forum/posts
}
```

**Implementation Steps**:
1. Parse search query
2. Search in post content and tags
3. Use vector search if available for semantic matching
4. Rank results by relevance and recency
5. Return matching posts

#### GET /api/forum/circles
**Purpose**: Get list of interest circles/tags

**Response**:
```typescript
{
  success: true,
  data: {
    name: string;
    usageCount: number;
  }[]
}
```

**Implementation Steps**:
1. Query Tag table ordered by usageCount
2. Return top tags (popular circles)
3. Cache results in Redis (update hourly)

#### GET /api/forum/circles/:tag
**Purpose**: Get posts in a specific circle/tag

**Query Parameters**:
- `page?: number`
- `limit?: number`

**Response**:
```typescript
{
  success: true,
  data: ForumPost[]
}
```

**Implementation Steps**:
1. Query posts that include the specified tag
2. Return paginated results with same format as GET /forum/posts

#### POST /api/reports
**Purpose**: Report a post or comment

**Headers**: `Authorization: Bearer <accessToken>`

**Request Body**:
```typescript
{
  targetType: 'post' | 'comment';
  targetId: string;
  reason: string;
}
```

**Implementation Steps**:
1. Fetch target content
2. Create snapshot (store entire content + context as JSON)
3. Create Report record
4. Send notification to admin dashboard
5. Auto-flag if multiple reports (threshold: 5)

---

## Module 3: Additional Features (附加功能)

### 4.1 Partner System (找队友)
**Purpose**: Students can find partners for various activities (travel, food, sports, courses, etc.)

#### Database Schema

```prisma
model PartnerPost {
  id          String          @id @default(uuid())
  category    PartnerCategory // travel, food, course, sports, other
  type        String          // Specific activity type
  title       String
  description String          @db.Text
  time        String          // When the activity will happen
  location    String          // Where to meet
  authorId    String
  expired     Boolean         @default(false)
  expiresAt   DateTime
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  
  author      User            @relation(fields: [authorId], references: [id], onDelete: Cascade)
  joins       PartnerJoin[]
  
  @@index([category])
  @@index([expired])
  @@index([createdAt])
}

enum PartnerCategory {
  TRAVEL
  FOOD
  COURSE
  SPORTS
  OTHER
}

model PartnerJoin {
  id          String      @id @default(uuid())
  postId      String
  userId      String
  createdAt   DateTime    @default(now())
  
  post        PartnerPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([postId, userId])
  @@index([postId])
  @@index([userId])
}
```

#### API Routes

##### GET /api/partner
Get list of partner posts, optionally filtered by category.

**Query Parameters**:
- `category?: PartnerCategory` - Filter by category

**Response**:
```typescript
{
  success: true,
  data: PartnerPost[]
}
```

##### GET /api/partner/:id
Get specific partner post details.

##### POST /api/partner
Create a new partner post.

**Request Body**:
```typescript
{
  category: PartnerCategory;
  type: string;
  title: string;
  description: string;
  time: string;
  location: string;
  expiresAt: string; // ISO date
}
```

##### POST /api/partner/:id/join
Join a partner request (show interest).

---

### 4.2 Errand System (跑腿)
**Purpose**: Students can request help with errands (pickup items, buy things, etc.)

#### Database Schema

```prisma
model Errand {
  id          String         @id @default(uuid())
  category    ErrandCategory // pickup, buy, other
  type        String         // Specific errand type
  title       String
  description String         @db.Text
  from        String         // Starting location
  to          String         // Destination
  price       String         // Compensation
  item        String         // What needs to be picked up/bought
  time        String         // When it needs to be done
  authorId    String
  expired     Boolean        @default(false)
  expiresAt   DateTime
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  
  author      User           @relation(fields: [authorId], references: [id], onDelete: Cascade)
  accepts     ErrandAccept[]
  
  @@index([category])
  @@index([expired])
  @@index([createdAt])
}

enum ErrandCategory {
  PICKUP
  BUY
  OTHER
}

model ErrandAccept {
  id          String   @id @default(uuid())
  errandId    String
  userId      String
  createdAt   DateTime @default(now())
  
  errand      Errand   @relation(fields: [errandId], references: [id], onDelete: Cascade)
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([errandId, userId])
  @@index([errandId])
  @@index([userId])
}
```

#### API Routes

##### GET /api/errands
Get list of errands, optionally filtered by category.

**Query Parameters**:
- `category?: ErrandCategory` - Filter by category

##### GET /api/errands/:id
Get specific errand details.

##### POST /api/errands
Create a new errand.

**Request Body**:
```typescript
{
  category: ErrandCategory;
  type: string;
  title: string;
  description: string;
  from: string;
  to: string;
  price: string;
  item: string;
  time: string;
  expiresAt: string; // ISO date
}
```

##### POST /api/errands/:id/accept
Accept an errand request.

---

### 4.3 Secondhand Marketplace (二手交易)
**Purpose**: Buy and sell secondhand items within the campus community.

#### Database Schema

```prisma
model SecondhandItem {
  id          String              @id @default(uuid())
  category    SecondhandCategory  // electronics, books, furniture, other
  type        String              // Specific item type
  title       String
  description String              @db.Text
  price       String
  condition   String              // Item condition (e.g., "9成新")
  location    String              // Pickup location
  images      String[]            // Array of image URLs
  authorId    String
  sold        Boolean             @default(false)
  expired     Boolean             @default(false)
  expiresAt   DateTime
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
  
  author      User                @relation(fields: [authorId], references: [id], onDelete: Cascade)
  wants       SecondhandWant[]
  
  @@index([category])
  @@index([sold])
  @@index([expired])
  @@index([createdAt])
}

enum SecondhandCategory {
  ELECTRONICS
  BOOKS
  FURNITURE
  OTHER
}

model SecondhandWant {
  id          String         @id @default(uuid())
  itemId      String
  userId      String
  createdAt   DateTime       @default(now())
  
  item        SecondhandItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  user        User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([itemId, userId])
  @@index([itemId])
  @@index([userId])
}
```

#### API Routes

##### GET /api/secondhand
Get list of secondhand items, optionally filtered by category.

**Query Parameters**:
- `category?: SecondhandCategory` - Filter by category
- `sold?: boolean` - Filter by sold status

##### GET /api/secondhand/:id
Get specific item details.

##### POST /api/secondhand
Create a new secondhand listing.

**Request Body**:
```typescript
{
  category: SecondhandCategory;
  type: string;
  title: string;
  description: string;
  price: string;
  condition: string;
  location: string;
  images?: string[]; // Image URLs
  expiresAt: string; // ISO date
}
```

##### POST /api/secondhand/:id/want
Express interest in an item ("I want this").

---

### 4.4 Rating System (评价系统)
**Purpose**: Rate courses, teachers, canteens, and majors with multi-dimensional scores and tags.

#### Database Schema

```prisma
model RatingItem {
  id          String         @id @default(uuid())
  category    RatingCategory // course, teacher, canteen, major
  name        String
  department  String
  code        String?        // For courses (e.g., "COMP1001")
  email       String?        // For teachers
  location    String?        // For canteens
  avatar      String?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  
  ratings     Rating[]
  
  @@unique([category, code])  // For courses
  @@unique([category, email]) // For teachers
  @@index([category])
  @@index([name])
}

enum RatingCategory {
  COURSE
  TEACHER
  CANTEEN
  MAJOR
}

model Rating {
  id              String       @id @default(uuid())
  itemId          String
  userId          String
  scores          Json         // { "quality": 4.5, "difficulty": 3.0, ... }
  tags            String[]     // Array of tag strings
  comment         String?      @db.Text
  semester        String?      // For course ratings (e.g., "2024 Spring")
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  
  item            RatingItem   @relation(fields: [itemId], references: [id], onDelete: Cascade)
  user            User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([itemId, userId, semester]) // One rating per user per semester
  @@index([itemId])
  @@index([userId])
  @@index([createdAt])
}

model ScoreDimension {
  id          String         @id @default(uuid())
  category    RatingCategory
  name        String         // e.g., "quality", "difficulty", "workload"
  label       Json           // Multi-language labels { "en": "Quality", "zh": "质量" }
  order       Int            // Display order
  
  @@unique([category, name])
  @@index([category])
}
```

#### API Routes

##### GET /api/ratings/:category
Get list of items in a category (course/teacher/canteen/major).

**Query Parameters**:
- `sortMode?: 'recent' | 'controversial'` - Sort by recent activity or score variance

**Response**:
```typescript
{
  success: true,
  data: {
    name: string;
    department: string;
    code?: string;  // For courses
    email?: string; // For teachers
    location?: string; // For canteens
    scores: { dimension: string; value: number; }[];
    tags: string[];
    tagCounts: Record<string, number>;
    ratingCount: number;
    recentCount: number;
    scoreVariance: number;
  }[]
}
```

##### GET /api/ratings/:category/:id
Get detailed ratings for a specific item.

##### POST /api/ratings/:category/:id/rate
Submit a rating for an item.

**Request Body**:
```typescript
{
  scores: Record<string, number>; // e.g., { "quality": 4.5, "difficulty": 3.0 }
  tags: string[];
  comment?: string;
  semester?: string; // For course ratings
}
```

##### GET /api/ratings/:category/dimensions
Get score dimensions for a category (e.g., what aspects to rate).

**Response**:
```typescript
{
  success: true,
  data: {
    name: string;      // e.g., "quality"
    label: {           // Multi-language labels
      en: string;
      zh: string;
    };
    order: number;
  }[]
}
```

##### GET /api/ratings/:category/tags
Get available tags for a category.

**Response**:
```typescript
{
  success: true,
  data: string[]  // Array of tag options
}
```

---

### 4.5 Voting System (for Forum Posts)

```prisma
model Vote {
  id          String      @id @default(uuid())
  postId      String
  userId      String
  optionId    String      // Which poll option was voted for
  createdAt   DateTime    @default(now())
  
  post        Post        @relation("PostVotes", fields: [postId], references: [id], onDelete: Cascade)
  option      PollOption  @relation(fields: [optionId], references: [id], onDelete: Cascade)
  
  @@unique([postId, userId])
  @@index([postId])
  @@index([optionId])
}

model PollOption {
  id          String   @id @default(uuid())
  postId      String
  text        String
  voteCount   Int      @default(0)
  createdAt   DateTime @default(now())
  
  post        Post     @relation("PostPollOptions", fields: [postId], references: [id], onDelete: Cascade)
  votes       Vote[]
  
  @@index([postId])
}
```

#### POST /api/posts/:id/vote
**Purpose**: Cast a vote on a poll post

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```typescript
{
  optionId: string;  // The poll option ID to vote for
}
```

**Response**:
```typescript
{
  success: true;
  data: {
    optionId: string;
    voteCount: number;  // Updated vote count for this option
  }
}
```

**Route Handler** (`/app/api/posts/[id]/vote/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { handleError } from '@/lib/errors';

const voteSchema = z.object({
  optionId: z.string()
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user } = await getCurrentUser(req);
    const postId = params.id;
    const body = await req.json();
    const { optionId } = voteSchema.parse(body);

    // Verify post is a poll
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { pollOptions: true }
    });

    if (!post || post.postType !== 'poll') {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_A_POLL', message: 'This post is not a poll' } },
        { status: 400 }
      );
    }

    // Verify option belongs to this poll
    const option = post.pollOptions.find(o => o.id === optionId);
    if (!option) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_OPTION', message: 'Option does not exist for this poll' } },
        { status: 400 }
      );
    }

    // Check if poll has ended
    if (post.pollEndDate && new Date() > post.pollEndDate) {
      return NextResponse.json(
        { success: false, error: { code: 'POLL_ENDED', message: 'Poll has ended' } },
        { status: 400 }
      );
    }

    // Check if user already voted
    const existingVote = await prisma.vote.findUnique({
      where: {
        postId_userId: {
          postId,
          userId: user.id
        }
      }
    });

    if (existingVote) {
      // Update vote (change option)
      await prisma.$transaction([
        // Decrement old option
        prisma.pollOption.update({
          where: { id: existingVote.optionId },
          data: { voteCount: { decrement: 1 } }
        }),
        // Increment new option
        prisma.pollOption.update({
          where: { id: optionId },
          data: { voteCount: { increment: 1 } }
        }),
        // Update vote record
        prisma.vote.update({
          where: {
            postId_userId: {
              postId,
              userId: user.id
            }
          },
          data: { optionId }
        })
      ]);
    } else {
      // Create new vote
      await prisma.$transaction([
        prisma.vote.create({
          data: {
            postId,
            userId: user.id,
            optionId
          }
        }),
        prisma.pollOption.update({
          where: { id: optionId },
          data: { voteCount: { increment: 1 } }
        })
      ]);
    }

    // Get updated vote count
    const updatedOption = await prisma.pollOption.findUnique({
      where: { id: optionId },
      select: { voteCount: true }
    });

    return NextResponse.json({
      success: true,
      data: {
        optionId,
        voteCount: updatedOption?.voteCount || 0
      }
    });
  } catch (error) {
    return handleError(error);
  }
}
```

#### POST /api/posts/:id/repost
**Purpose**: Repost from additional features to main forum

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```typescript
{
  comment?: string;  // Optional comment when reposting
}
```

**Response**:
```typescript
{
  success: true;
  data: {
    postId: string;  // ID of the new repost
  }
}
```

**Route Handler** (`/app/api/posts/[id]/repost/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { handleError } from '@/lib/errors';

const repostSchema = z.object({
  comment: z.string().max(500).optional()
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user } = await getCurrentUser(req);
    const originalPostId = params.id;
    const body = await req.json();
    const { comment } = repostSchema.parse(body);

    // Get original post
    const originalPost = await prisma.post.findUnique({
      where: { id: originalPostId },
      include: { author: true }
    });

    if (!originalPost) {
      return NextResponse.json(
        { success: false, error: { code: 'POST_NOT_FOUND', message: 'Original post not found' } },
        { status: 404 }
      );
    }

    // Check if original post is from additional features
    if (!originalPost.category || originalPost.category === 'forum') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REPOST', message: 'Can only repost from additional features' } },
        { status: 400 }
      );
    }

    // Check if user already reposted this
    const existingRepost = await prisma.post.findFirst({
      where: {
        authorId: user.id,
        originalPostId,
        isRepost: true
      }
    });

    if (existingRepost) {
      return NextResponse.json(
        { success: false, error: { code: 'ALREADY_REPOSTED', message: 'You have already reposted this' } },
        { status: 400 }
      );
    }

    // Create repost in forum category
    const repost = await prisma.post.create({
      data: {
        authorId: user.id,
        postType: originalPost.postType,
        content: comment 
          ? `${comment}\\n\\n[Reposted from @${originalPost.author.nickname}]\\n${originalPost.content}`
          : `[Reposted from @${originalPost.author.nickname}]\\n${originalPost.content}`,
        images: originalPost.images,
        tags: originalPost.tags,
        category: 'forum',  // Always repost to forum
        isRepost: true,
        originalPostId
      }
    });

    // Create notification for original author
    await prisma.notification.create({
      data: {
        userId: originalPost.authorId,
        type: 'repost',
        actorId: user.id,
        postId: repost.id
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        postId: repost.id
      }
    });
  } catch (error) {
    return handleError(error);
  }
}
```

---

## Module 4: Notification System (通知系统)

### Database Schema

```prisma
model Notification {
  id          String   @id @default(uuid())
  userId      String
  type        String   // 'like', 'comment', 'follow'
  actorId     String?  // Who performed the action
  postId      String?  // Related post (for likes/comments)
  commentId   String?  // Related comment
  isRead      Boolean  @default(false)
  createdAt   DateTime @default(now())
  
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  actor       User?    @relation("NotificationActor", fields: [actorId], references: [id], onDelete: SetNull)
  
  @@index([userId, isRead])
  @@index([type])
  @@index([createdAt])
}
```

**Note**: Need to add to User model:
```prisma
notificationsSent Notification[] @relation("NotificationActor")
```

### API Endpoints

#### GET /api/notifications/likes
**Purpose**: Get notifications for post/comment likes

**Headers**: `Authorization: Bearer <token>`

**Response**:
```typescript
{
  success: true;
  data: {
    avatar: string;
    name: string;
    gender: 'male' | 'female' | 'other';
    action: string;  // e.g., "liked your post"
    postContent: string;  // Truncated post content
    time: string;  // Relative time (e.g., "2 hours ago")
  }[]
}
```

**Implementation Steps**:
1. Query notifications where type = 'like' for current user
2. Join with actor (who liked) and post/comment data
3. Format with relative time
4. Return sorted by createdAt descending

#### GET /api/notifications/followers
**Purpose**: Get notifications for new followers

**Headers**: `Authorization: Bearer <token>`

**Response**:
```typescript
{
  success: true;
  data: {
    avatar: string;
    name: string;
    gender: 'male' | 'female' | 'other';
    time: string;
  }[]
}
```

**Implementation Steps**:
1. Query notifications where type = 'follow' for current user
2. Join with actor (new follower) data
3. Format and return

#### GET /api/notifications/comments
**Purpose**: Get notifications for comments on user's posts

**Headers**: `Authorization: Bearer <token>`

**Response**:
```typescript
{
  success: true;
  data: {
    avatar: string;
    name: string;
    gender: 'male' | 'female' | 'other';
    postContent: string;  // Original post content (truncated)
    comment: string;  // The comment text
    time: string;
  }[]
}
```

**Implementation Steps**:
1. Query notifications where type = 'comment' for current user
2. Join with actor, post, and comment data
3. Format and return

model PushToken {
  id          String   @id @default(uuid())
  userId      String
  token       String   @unique
  platform    String   // 'ios', 'android', 'web'
  provider    String   // 'fcm' | 'jpush'
  createdAt   DateTime @default(now())
  
  @@index([userId])
}
```

### Push Notification Strategy

**Issue**: FCM gets killed on Chinese Android devices

**Solution**: Dual provider system
- **International**: FCM (iOS, web, international Android)
- **China**: JPush/极光 (Chinese Android devices)

#### POST /api/notifications/register-token
**Purpose**: Register device token

**Request Body**:
```typescript
{
  token: string;
  platform: 'ios' | 'android' | 'web';
  provider: 'fcm' | 'jpush';
}
```

#### GET /api/notifications
**Purpose**: Get user notifications

**Query Parameters**:
```typescript
{
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}
```

#### PUT /api/notifications/:id/read
**Purpose**: Mark notification as read

#### PUT /api/notifications/read-all
**Purpose**: Mark all notifications as read

### Background Notification Jobs

**Job Queue (Bull/BullMQ)**:
```typescript
// When someone likes a post
await notificationQueue.add('send-notification', {
  userId: post.authorId,
  type: 'like',
  title: '新的赞',
  message: `${liker.nickname} 赞了你的帖子`,
  data: { postId: post.id, likerId: liker.id }
});
```

**Worker**:
1. Create Notification record in DB
2. Fetch user's PushToken(s)
3. Send push notification via FCM/JPush
4. Handle failures (retry, remove invalid tokens)

---

## Module 5: Direct Messaging System (私信系统)

### Overview

WhatsApp-style direct messaging with smart permission system:
- **Strangers**: Can send **at most 1 message** until recipient follows back or replies
- **Followed users**: Can send unlimited messages
- **After reply**: Conversation unlocked, both users can message freely

### Database Schema

See User, DirectMessage, and Follow models in Module 1.

### Permission Logic

```typescript
// Check if user can send DM to recipient
async function canSendMessage(senderId: string, receiverId: string): Promise<boolean> {
  // 1. Check if blocked
  const blocked = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: senderId, blockedId: receiverId },
        { blockerId: receiverId, blockedId: senderId }
      ]
    }
  });
  if (blocked) return false;
  
  // 2. Check if receiver follows sender
  const receiverFollowsSender = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId: receiverId,
        followingId: senderId
      }
    }
  });
  if (receiverFollowsSender) return true;  // Followed users can always message
  
  // 3. Check if there's existing conversation (receiver has replied)
  const receiverHasReplied = await prisma.directMessage.findFirst({
    where: {
      senderId: receiverId,
      receiverId: senderId
    }
  });
  if (receiverHasReplied) return true;  // Conversation unlocked
  
  // 4. Check message count from sender to receiver (strangers limited to 1)
  const messageCount = await prisma.directMessage.count({
    where: {
      senderId,
      receiverId,
      isDeleted: false
    }
  });
  
  return messageCount === 0;  // Can send if no messages sent yet
}
```

### API Endpoints

#### GET /api/messages/contacts
**Purpose**: Get list of message contacts (people user has messaged with)

**Headers**: `Authorization: Bearer <token>`

**Response**:
```typescript
{
  success: true;
  data: {
    name: string;
    avatar: string;
    gender: 'male' | 'female' | 'other';
    lastMessage: string;
    time: string;  // Relative time
    unread: number;  // Unread message count
  }[]
}
```

**Implementation Steps**:
1. Query all DirectMessages where user is sender or receiver
2. Group by conversation partner
3. Get most recent message for each conversation
4. Count unread messages (isRead = false, receiverId = currentUser)
5. Sort by most recent message time
6. Return contact list

#### GET /api/messages/chat/:contactId
**Purpose**: Get chat history with a specific contact

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:
- `page?: number`
- `limit?: number` (default: 50)

**Response**:
```typescript
{
  success: true;
  data: {
    sender: string;  // User ID or name
    text: string;
    time: string;  // ISO string
    isMine: boolean;  // True if sent by current user
  }[]
}
```

**Implementation Steps**:
1. Verify permission with `canSendMessage()` logic
2. Query DirectMessages between current user and contact
3. Mark messages as read if receiver is current user
4. Return chronologically ordered messages
5. Include isMine flag for UI rendering

#### POST /api/messages/chat/:contactId/send
**Purpose**: Send message to a specific contact

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```typescript
{
  text: string;
}
```

**Response**:
```typescript
{
  success: true;
}
```

**Implementation Steps**:
1. Verify contact exists
2. Check permissions with `canSendMessage()` logic
3. If cannot send, return error with appropriate message
4. Create DirectMessage record
5. Send push notification to recipient
6. Return success

#### POST /api/messages
**Purpose**: Send a direct message

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```typescript
{
  receiverId: string;
  content: string;
  images?: string[];  // OSS URLs
}
```

**Implementation Steps**:
1. Verify receiver exists and is active
2. Check permissions with `canSendMessage()`
3. If cannot send, return error:
   - If blocked: "Cannot message this user"
   - If limit reached: "You can only send one message until they reply or follow you"
4. Create DirectMessage record
5. Send push notification to receiver
6. Return message object

**Route Handler** (`/app/api/messages/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { messageService } from '@/services/message.service';
import { handleError } from '@/lib/errors';

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const { receiverId, content, images } = await req.json();
    
    const message = await messageService.sendMessage({
      senderId: user.id,
      receiverId,
      content,
      images
    });
    
    return NextResponse.json({
      success: true,
      data: message
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    
    // Get all conversations for user
    const conversations = await messageService.getConversations(user.id, page, limit);
    
    return NextResponse.json({
      success: true,
      data: conversations
    });
  } catch (error) {
    return handleError(error);
  }
}
```

#### GET /api/messages/conversations
**Purpose**: Get all conversations with latest message preview

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:
```typescript
{
  page?: number;
  limit?: number;
}
```

**Response**:
```typescript
{
  success: true,
  data: [
    {
      userId: string;  // Other user's ID
      user: { id, nickname, avatar };
      latestMessage: {
        content: string;
        createdAt: Date;
        isRead: boolean;
        senderId: string;
      };
      unreadCount: number;
      canReply: boolean;  // Based on permission logic
    }
  ]
}
```

**Implementation Steps**:
1. Query messages where user is sender OR receiver
2. Group by conversation (other user ID)
3. Get latest message for each conversation
4. Count unread messages per conversation
5. Check `canSendMessage()` for reply permission
6. Return sorted by latest message timestamp

#### GET /api/messages/:userId
**Purpose**: Get message history with specific user

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:
```typescript
{
  page?: number;
  limit?: number;
  before?: Date;  // Cursor-based pagination
}
```

**Implementation Steps**:
1. Fetch messages between current user and specified user
2. Order by createdAt DESC
3. Mark messages as read (where receiverId = currentUser)
4. Return messages with pagination

#### PUT /api/messages/:id/read
**Purpose**: Mark message as read

**Headers**: `Authorization: Bearer <token>`

**Implementation**:
1. Verify user is the receiver
2. Update `isRead = true`
3. Send read receipt notification (optional)

#### DELETE /api/messages/:id
**Purpose**: Delete a message (soft delete)

**Headers**: `Authorization: Bearer <token>`

**Implementation**:
1. Verify user is the sender
2. Set `isDeleted = true`
3. Message hidden from both users
4. Cannot be undeleted

#### POST /api/follow
**Purpose**: Follow a user (enables unlimited messaging)

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```typescript
{ userId: string }
```

**Implementation**:
1. Check user exists and is active
2. Create Follow record
3. Send notification to followed user
4. Return follow object

#### DELETE /api/follow/:userId
**Purpose**: Unfollow a user

**Headers**: `Authorization: Bearer <token>`

**Implementation**:
1. Delete Follow record
2. Does NOT restrict existing conversations
3. Future messages follow standard permission rules

### Service Layer

**File**: `/src/services/message.service.ts`

```typescript
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { ValidationError, ForbiddenError } from '@/lib/errors';
import { notificationService } from './notification.service';

export class MessageService {
  async canSendMessage(senderId: string, receiverId: string): Promise<boolean> {
    // Check blocked status
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: receiverId },
          { blockerId: receiverId, blockedId: senderId }
        ]
      }
    });
    if (blocked) return false;
    
    // Check if receiver follows sender
    const receiverFollowsSender = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: receiverId,
          followingId: senderId
        }
      }
    });
    if (receiverFollowsSender) return true;
    
    // Check if conversation exists (receiver has replied)
    const receiverHasReplied = await prisma.directMessage.findFirst({
      where: { senderId: receiverId, receiverId: senderId }
    });
    if (receiverHasReplied) return true;
    
    // Count messages from sender to receiver
    const messageCount = await prisma.directMessage.count({
      where: { senderId, receiverId, isDeleted: false }
    });
    
    return messageCount === 0;
  }
  
  async sendMessage(data: {
    senderId: string;
    receiverId: string;
    content: string;
    images?: string[];
  }) {
    // Validate receiver
    const receiver = await prisma.user.findUnique({
      where: { id: data.receiverId }
    });
    
    if (!receiver || !receiver.isActive || receiver.isBanned) {
      throw new ValidationError('Cannot send message to this user');
    }
    
    if (data.senderId === data.receiverId) {
      throw new ValidationError('Cannot message yourself');
    }
    
    // Check permissions
    const canSend = await this.canSendMessage(data.senderId, data.receiverId);
    if (!canSend) {
      throw new ForbiddenError(
        'You can only send one message until they reply or follow you'
      );
    }
    
    // Sanitize content
    const sanitizedContent = this.sanitizeContent(data.content);
    
    // Create message
    const message = await prisma.directMessage.create({
      data: {
        senderId: data.senderId,
        receiverId: data.receiverId,
        content: sanitizedContent,
        images: data.images || []
      },
      include: {
        sender: {
          select: { id: true, nickname: true, avatar: true }
        },
        receiver: {
          select: { id: true, nickname: true, avatar: true }
        }
      }
    });
    
    // Send push notification
    await notificationService.sendPushNotification({
      userId: data.receiverId,
      title: `New message from ${message.sender.nickname}`,
      message: sanitizedContent.substring(0, 100),
      data: { type: 'direct_message', messageId: message.id, senderId: data.senderId }
    });
    
    return message;
  }
  
  async getConversations(userId: string, page: number = 1, limit: number = 20) {
    // Get all users this user has messaged with
    const conversations = await prisma.$queryRaw`
      SELECT 
        CASE 
          WHEN "senderId" = ${userId} THEN "receiverId"
          ELSE "senderId"
        END as "otherUserId",
        MAX("createdAt") as "latestMessageTime"
      FROM "DirectMessage"
      WHERE ("senderId" = ${userId} OR "receiverId" = ${userId})
        AND "isDeleted" = false
      GROUP BY "otherUserId"
      ORDER BY "latestMessageTime" DESC
      LIMIT ${limit}
      OFFSET ${(page - 1) * limit}
    `;
    
    // Fetch details for each conversation
    const result = await Promise.all(
      conversations.map(async (conv: any) => {
        const otherUser = await prisma.user.findUnique({
          where: { id: conv.otherUserId },
          select: { id: true, nickname: true, avatar: true, isActive: true }
        });
        
        const latestMessage = await prisma.directMessage.findFirst({
          where: {
            OR: [
              { senderId: userId, receiverId: conv.otherUserId },
              { senderId: conv.otherUserId, receiverId: userId }
            ],
            isDeleted: false
          },
          orderBy: { createdAt: 'desc' }
        });
        
        const unreadCount = await prisma.directMessage.count({
          where: {
            senderId: conv.otherUserId,
            receiverId: userId,
            isRead: false,
            isDeleted: false
          }
        });
        
        const canReply = await this.canSendMessage(userId, conv.otherUserId);
        
        return {
          userId: conv.otherUserId,
          user: otherUser,
          latestMessage: latestMessage ? {
            content: latestMessage.content,
            createdAt: latestMessage.createdAt,
            isRead: latestMessage.isRead,
            senderId: latestMessage.senderId
          } : null,
          unreadCount,
          canReply
        };
      })
    );
    
    return result;
  }
  
  async getMessageHistory(
    userId: string,
    otherUserId: string,
    page: number = 1,
    limit: number = 50
  ) {
    const messages = await prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId }
        ],
        isDeleted: false
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
      include: {
        sender: {
          select: { id: true, nickname: true, avatar: true }
        }
      }
    });
    
    // Mark messages as read
    await prisma.directMessage.updateMany({
      where: {
        senderId: otherUserId,
        receiverId: userId,
        isRead: false
      },
      data: { isRead: true }
    });
    
    return messages.reverse();  // Return in chronological order
  }
  
  private sanitizeContent(content: string): string {
    // Remove dangerous HTML/scripts
    return content.replace(/<script[^>]*>.*?<\/script>/gi, '')
                  .replace(/<[^>]+>/g, '')
                  .trim();
  }
}

export const messageService = new MessageService();
```

### Real-time Updates (Optional)

For real-time messaging, consider:
1. **WebSocket**: Use Socket.io or native WebSocket
2. **Server-Sent Events**: For one-way updates
3. **Polling**: Simple fallback (every 5-10 seconds)

**WebSocket Events**:
- `message:new`: New message received
- `message:read`: Message read by recipient
- `typing`: User is typing indicator

---

## Module 6: Data Analytics (数据系统)

### Integration

**Microsoft Clarity**: Add script to frontend for user behavior analytics

### Custom Analytics Schema

```prisma
model AnalyticsEvent {
  id          String   @id @default(uuid())
  userId      String?
  eventType   String   // 'post_view', 'post_create', 'search', 'feature_click'
  eventData   Json
  timestamp   DateTime @default(now())
  
  @@index([eventType, timestamp])
  @@index([userId])
}
```

#### POST /api/analytics/event
**Purpose**: Log analytics event

**Request Body**:
```typescript
{
  eventType: string;
  eventData: Record<string, any>;
}
```

#### GET /api/admin/analytics
**Purpose**: Get analytics dashboard data

**Query Parameters**:
```typescript
{
  metric: 'feature_usage' | 'search_terms' | 'user_activity';
  dateRange: { start: Date, end: Date };
}
```

---

## Implementation Guidelines for AI Agents

### Phase 1: Foundation (Week 1-2)
1. Set up Next.js project with TypeScript
2. Configure Prisma with PostgreSQL (create User, Session, Block models)
3. Set up Redis connection for caching
4. Implement JWT utilities (sign, verify) in `/src/lib/auth`
5. Create authentication middleware:
   - Verify JWT signature
   - Validate session exists in database
   - Check user status (isActive, isBanned)
   - Attach user to request context
6. Create helper function `getCurrentUser(req)` for route handlers
7. Set up custom error classes (UnauthorizedError, ValidationError, etc.)
8. Set up OSS integration (Alibaba Cloud OSS/AWS S3)

### Phase 2: User System (Week 2-3)
1. Create Zod schemas for all auth/user operations
2. Implement auth service layer (registration, login, session management)
3. Create API route handlers (thin layer calling services)
4. Set up email service (AWS SES/Alibaba) for verification codes
5. Implement OAuth integration (Google, Apple)
6. Build password change flow with email verification
7. Implement user blocking service and endpoints
8. Set up HKBU email verification (student status only)

### Phase 3: Forum System (Week 3-5)
1. Implement post CRUD operations with postType (image-text, text, poll)
2. Build poll system with PollOption and Vote models
3. Implement category-specific fields (find-partner, run-errands, marketplace, ratings)
4. Build comment system (2-level)
5. Implement like/unlike functionality
6. Add view tracking with Redis
7. Build image upload with OSS
8. Implement content sanitization
9. Add reporting system
10. Build repost functionality for additional features

### Phase 4: Search & Notifications (Week 5-6)
1. Set up vector database (Pinecone/Qdrant)
2. Implement embedding generation jobs
3. Build semantic search endpoint
4. Set up notification system
5. Integrate FCM and JPush
6. Implement notification queue
7. Build direct messaging system
8. Implement Follow model for DM permissions
9. Add message permission logic
10. Optional: Add WebSocket for real-time messaging

### Phase 5: Additional Features (Week 6-7)
1. Implement find-partner category with eventEndDate
2. Implement run-errands category with price, addresses, taskEndTime
3. Implement marketplace category with itemPrice, itemLocation, itemStatus
4. Build course rating system
5. Implement data export feature
6. Add analytics tracking
7. Add language preference to user settings

### Phase 6: Optimization & Polish (Week 7-8)
1. Add Redis caching for hot data
2. Optimize database queries with indexes
3. Implement rate limiting
4. Add comprehensive error handling
5. Write API documentation
6. Set up monitoring (Sentry, logging)

---

## Security Checklist

- [ ] All passwords hashed with bcrypt (12 rounds, salt auto-managed)
- [ ] JWT tokens properly signed and verified
- [ ] Server-side sessions tracked in database
- [ ] Session validation on every request
- [ ] Session cleanup on logout/password change
- [ ] Input sanitization for XSS prevention
- [ ] SQL injection prevention (Prisma ORM)
- [ ] Rate limiting on all endpoints
- [ ] CORS properly configured
- [ ] File upload validation (type, size, mime)
- [ ] OSS URLs validated before storage
- [ ] Captcha on registration
- [ ] Temp-mail blocklist
- [ ] Block user cascade (hide content)
- [ ] Admin endpoints protected
- [ ] HTTPS only in production
- [ ] Environment variables for secrets

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/buhub

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-jwt-secret-key-min-32-chars
JWT_EXPIRY=7d  # 7 days

# OSS (Alibaba Cloud)
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_BUCKET=
OSS_REGION=
OSS_ENDPOINT=

# Email (AWS SES / Alibaba)
EMAIL_PROVIDER=ses
EMAIL_ACCESS_KEY=
EMAIL_SECRET_KEY=
EMAIL_REGION=
EMAIL_FROM=noreply@buhub.com

# OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=

# Push Notifications
FCM_SERVER_KEY=
JPUSH_APP_KEY=
JPUSH_MASTER_SECRET=

# Vector Search
PINECONE_API_KEY=
PINECONE_ENVIRONMENT=
OPENAI_API_KEY=  # For embeddings

# Captcha
HCAPTCHA_SECRET=

# Analytics
CLARITY_PROJECT_ID=

# Monitoring
SENTRY_DSN=
```

---

## Testing Strategy

### Unit Tests
- Auth utilities (JWT, password hashing)
- Content sanitization
- Validation functions

### Integration Tests
- User registration flow
- Login/logout flow
- Post creation and retrieval
- Comment system
- Like/unlike operations
- Block user functionality

### E2E Tests
- Complete user journey (register → post → comment → like)
- OAuth flow
- Image upload flow
- Search functionality

---

## Performance Optimization

### Redis Caching Strategy
```typescript
// Cache hot data
- User blocked lists: TTL 5 min
- Post view counts: Batch update every 5 min
- Post like counts: Batch update every 1 min
- Trending posts: TTL 15 min
- Popular tags: TTL 1 hour
```

### Database Optimization
- Add indexes on foreign keys
- Add composite indexes for common queries
- Use `EXPLAIN ANALYZE` for slow queries
- Implement pagination with cursor-based approach for large datasets

### Background Jobs
- Use Bull/BullMQ with Redis
- Separate queues:
  - High priority: Notifications
  - Medium priority: Analytics events
  - Low priority: Vector embeddings, data export

---

## API Response Format

### Success Response
```typescript
{
  success: true,
  data: any,
  message?: string
}
```

### Error Response
```typescript
{
  success: false,
  error: {
    code: string,      // 'AUTH_FAILED', 'VALIDATION_ERROR', etc.
    message: string,
    details?: any
  }
}
```

### Pagination Response
```typescript
{
  success: true,
  data: any[],
  pagination: {
    page: number,
    limit: number,
    total: number,
    totalPages: number,
    hasNext: boolean,
    hasPrev: boolean
  }
}
```

---

## Deployment Considerations

### Docker Configuration
- Multi-stage build for Next.js
- Separate containers for API, Redis, PostgreSQL
- Use docker-compose for local development

### Production Checklist
- Set up database backups (daily)
- Configure Redis persistence
- Set up CDN for OSS assets
- Enable API monitoring
- Set up log aggregation
- Configure auto-scaling
- Set up health check endpoints
- Enable HTTPS with Let's Encrypt
- Configure firewall rules
- Set up database connection pooling

---

## Appendix: Useful Libraries

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "@prisma/client": "^5.0.0",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "redis": "^4.6.0",
    "zod": "^3.22.4",
    "ali-oss": "^6.18.0",
    "nodemailer": "^6.9.7",
    "bullmq": "^4.15.0",
    "@pinecone-database/pinecone": "^1.1.0",
    "openai": "^4.20.0",
    "firebase-admin": "^11.11.0",
    "jpush-sdk": "^3.7.1",
    "isomorphic-dompurify": "^2.9.0"
  },
  "devDependencies": {
    "prisma": "^5.0.0",
    "@types/node": "^20.10.0",
    "@types/bcrypt": "^5.0.2",
    "@types/jsonwebtoken": "^9.0.5",
    "typescript": "^5.3.0"
  }
}
```

---

## Authentication Middleware Implementation

**File**: `/src/middleware.ts` (Next.js middleware)

```typescript
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // Public routes that don't require authentication
  const publicRoutes = [
    '/api/auth/register',
    '/api/auth/login',
    '/api/posts', // Public viewing
  ];

  const path = request.nextUrl.pathname;
  
  // Check if route is public
  if (publicRoutes.some(route => path.startsWith(route))) {
    return NextResponse.next();
  }

  // Check for auth token
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
```

**File**: `/src/lib/auth.ts` (Helper functions)

```typescript
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { prisma } from './db';
import { redis } from './redis';
import { UnauthorizedError } from './errors';

interface JWTPayload {
  userId: string;
  jti: string;  // Session ID
  role: string;
}

/**
 * Get current authenticated user from request
 * Uses Redis for fast session validation
 */
export async function getCurrentUser(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  
  if (!token) {
    throw new UnauthorizedError('No token provided');
  }

  try {
    // Verify JWT signature and expiry
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;

    // Check session in Redis (FAST!)
    const sessionJson = await redis.get(`session:${decoded.jti}`);
    if (!sessionJson) {
      throw new UnauthorizedError('Session not found or expired');
    }

    const session = JSON.parse(sessionJson);

    // Get user data with caching (5 min TTL)
    const userCacheKey = `user:${session.userId}`;
    let userJson = await redis.get(userCacheKey);
    
    if (!userJson) {
      // Cache miss - fetch from database
      const user = await prisma.user.findUnique({
        where: { id: session.userId }
      });
      
      if (!user) {
        throw new UnauthorizedError('User not found');
      }
      
      // Cache for 5 minutes
      await redis.setex(userCacheKey, 300, JSON.stringify(user));
      userJson = JSON.stringify(user);
    }

    const user = JSON.parse(userJson);

    // Check user status
    if (!user.isActive) {
      throw new UnauthorizedError('Account deactivated');
    }

    if (user.isBanned) {
      throw new UnauthorizedError('Account banned');
    }

    // Update last used time in Redis (async, don't block)
    session.lastUsedAt = Date.now();
    redis.setex(
      `session:${decoded.jti}`,
      7 * 24 * 60 * 60,  // Reset 7-day TTL
      JSON.stringify(session)
    ).catch(console.error);

    return { user, session, jti: decoded.jti };
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token');
    }
    throw error;
  }
}

/**
 * Check if user has required role
 */
export async function requireRole(req: NextRequest, requiredRole: 'ADMIN' | 'MODERATOR') {
  const { user } = await getCurrentUser(req);
  
  if (requiredRole === 'ADMIN' && user.role !== 'ADMIN') {
    throw new UnauthorizedError('Admin access required');
  }
  
  if (requiredRole === 'MODERATOR' && user.role !== 'MODERATOR' && user.role !== 'ADMIN') {
    throw new UnauthorizedError('Moderator access required');
  }
  
  return { user };
}
```

**Usage in Route Handlers**:

```typescript
// Regular authenticated endpoint
export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    // ... use user.id, user.role, etc.
  } catch (error) {
    return handleError(error);
  }
}

// Admin-only endpoint
export async function DELETE(req: NextRequest) {
  try {
    const { user } = await requireRole(req, 'ADMIN');
    // ... admin operations
  } catch (error) {
    return handleError(error);
  }
}
```

---

## Notes for AI Agents

### Architecture Guidelines

1. **Always validate input**: Use Zod schemas for all request validation
2. **Service layer**: All business logic in `/src/services`, never in route handlers
3. **Route handlers**: Should only:
   - Parse and validate requests (Zod)
   - Call service layer
   - Format responses
   - Handle errors
4. **Schema layer**: Define all Zod schemas in `/src/schemas`

### Authentication Best Practices

1. **Single JWT only**: No refresh tokens, sessions managed server-side
2. **Session validation**: Every request checks database session (with Redis caching)
3. **Password security**: Bcrypt auto-manages salt, use 12 rounds
4. **Role-based access**: Use `requireRole()` helper for protected endpoints
5. **Error handling**: Always use custom error classes with proper status codes
6. **Logging**: Log all auth events (login, logout, password change, failed attempts)
7. **Transaction safety**: Use Prisma transactions for multi-table operations
8. **Race conditions**: Use Redis locks for critical operations (e.g., like/unlike)
9. **Idempotency**: Make operations idempotent where possible (use unique constraints)
10. **Soft deletes**: Never hard delete user-generated content (use `isDeleted` flags)
11. **Audit trail**: Log admin actions and sensitive operations
12. **Rate limiting**: Implement per-user and per-IP rate limits
13. **Graceful degradation**: If Redis/Vector DB fails, fall back to basic functionality

### OAuth Provider Notes

- **Google OAuth**: Use Google Identity Services or Firebase Auth
- **Apple Sign In**: Requires Apple Developer account and proper configuration
- **HKBU Email**: Only for student verification, NOT for OAuth login
  - Send verification code to @hkbu.edu.hk or @life.hkbu.edu.hk
  - Store code in Redis with 10-minute TTL
  - Update `isHKBUVerified` and `hkbuEmail` fields
2. **Error handling**: Wrap all async operations in try-catch
3. **Logging**: Log all critical operations and errors
4. **Transaction**: Use Prisma transactions for multi-table operations
5. **Race conditions**: Use Redis locks for critical operations (e.g., like/unlike)
6. **Idempotency**: Make operations idempotent where possible
7. **Soft deletes**: Never hard delete user-generated content
8. **Audit trail**: Log admin actions and sensitive operations
9. **Rate limiting**: Implement per-user and per-IP rate limits
10. **Graceful degradation**: If Redis/Vector DB fails, fall back to basic functionality

---

## Example: Complete Feature Implementation

Here's a complete example showing proper architecture for a feature:

**1. Schema** (`/src/schemas/post.schema.ts`):
```typescript
import { z } from 'zod';

export const createPostSchema = z.object({
  content: z.string().min(1).max(5000),
  images: z.array(z.string().url()).max(9).optional(),
  tags: z.array(z.string().min(1).max(20)).max(5).optional(),
  category: z.enum(['forum', 'marketplace', 'lost-found']).optional()
});
```

**2. Service** (`/src/services/post.service.ts`):
```typescript
import { prisma } from '@/lib/db';
import DOMPurify from 'isomorphic-dompurify';

export class PostService {
  async createPost(userId: string, data: CreatePostInput) {
    // Sanitize content
    const sanitizedContent = DOMPurify.sanitize(data.content);
    
    // Create post
    const post = await prisma.post.create({
      data: {
        authorId: userId,
        content: sanitizedContent,
        images: data.images || [],
        tags: data.tags || [],
        category: data.category || 'forum'
      },
      include: { author: true }
    });
    
    // Trigger background jobs
    await this.afterPostCreated(post);
    
    return post;
  }
  
  private async afterPostCreated(post: Post) {
    // Update tag counts
    // Generate vector embedding
    // Send notifications
  }
}
```

**3. Route Handler** (`/app/api/posts/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createPostSchema } from '@/schemas/post.schema';
import { postService } from '@/services/post.service';
import { getCurrentUser } from '@/lib/auth';
import { handleError } from '@/lib/errors';

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const { user } = await getCurrentUser(req);
    
    // Validate request
    const body = await req.json();
    const data = createPostSchema.parse(body);
    
    // Call service
    const post = await postService.createPost(user.id, data);
    
    // Return response
    return NextResponse.json({
      success: true,
      data: post
    });
  } catch (error) {
    return handleError(error);
  }
}
```

---

This guide provides a comprehensive blueprint for implementing the BUHUB backend. Each agent should follow the phase-by-phase approach, implement security measures, and maintain code quality standards throughout development.
