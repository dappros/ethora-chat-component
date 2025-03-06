# Ethora Chat Component Protocol Flow

This document describes the complete client-server interaction flow in the Ethora chat system, from user authentication to message handling.

## 1. Authentication and Connection

### 1.1 Initial Login
1. User provides credentials (email/password) or uses configured authentication method
2. Client initializes XMPP connection:
   ```typescript
   client = xmpp.client({
     service: wss://xmpp.ethoradev.com:5443/ws,
     username: walletToUsername(username),
     password: password
   })
   ```
3. Connection states:
   - 'connecting': Initial connection attempt
   - 'online': Successfully connected
   - 'error': Connection failed
   - 'offline': Disconnected

### 1.2 Session Establishment
1. After successful connection:
   - Client sends initial presence stanza
   - Server acknowledges connection
   - Client is ready for room operations

## 2. Room Management

### 2.1 Joining Rooms
1. Client requests available rooms:
   ```xml
   <iq type='get' id='getUserRooms'>
     <query xmlns='http://jabber.org/protocol/disco#items'/>
   </iq>
   ```
2. Server responds with room list
3. For each room:
   - Client sends presence to join
   - Server confirms membership
   - Client requests room history

### 2.2 Room Presence
1. Client sends presence stanza to room:
   ```xml
   <presence to='roomJID/username'/>
   ```
2. Server responds with:
   - Room roster (member list)
   - Room configuration
   - User's role in room

## 3. Message Flow

### 3.1 Sending Messages
1. Regular text message:
   ```xml
   <message type='groupchat' to='roomJID' id='unique-id'>
     <body>message text</body>
   </message>
   ```

2. Media message:
   - Client uploads media to storage
   - Sends message with media URL and metadata
   - Recipients download media on demand

### 3.2 Receiving Messages
1. Server broadcasts message to room members
2. Client processes incoming stanzas:
   - Regular messages
   - System notifications
   - Presence updates
   - Typing indicators

### 3.3 Message Types
- Text messages
- Media attachments
- System notifications
- Reactions
- Edited messages
- Deleted messages

## 4. Real-time Features

### 4.1 Typing Indicators
1. User starts typing:
   ```xml
   <message to='roomJID'>
     <composing xmlns='http://jabber.org/protocol/chatstates'/>
   </message>
   ```
2. User stops typing:
   ```xml
   <message to='roomJID'>
     <paused xmlns='http://jabber.org/protocol/chatstates'/>
   </message>
   ```

### 4.2 Message Status
- Sent (client to server)
- Delivered (server to recipients)
- Read (recipient viewed)

## 5. Error Handling

### 5.1 Connection Issues
1. Client attempts automatic reconnection (max 3 attempts)
2. On reconnect:
   - Rejoin rooms
   - Request missed messages
   - Restore presence state

### 5.2 Message Errors
- Failed delivery notifications
- Rate limiting responses
- Permission errors

## 6. Advanced Features

### 6.1 Message History
1. Client requests history:
   ```xml
   <iq type='get' id='history'>
     <query xmlns='urn:xmpp:mam:2'/>
   </iq>
   ```
2. Server returns paginated message history

### 6.2 Room Management
- Create rooms
- Modify room settings
- Invite users
- Manage member roles