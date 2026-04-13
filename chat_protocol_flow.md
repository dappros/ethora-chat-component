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
   ```xml
   <!-- Client sends initial presence stanza -->
   <presence/>
   
   <!-- Server acknowledges with session establishment -->
   <iq type='result'>
     <session xmlns='urn:ietf:params:xml:ns:xmpp-session'/>
   </iq>
   ```

## 2. Room Management

### 2.1 Joining Rooms
1. Client requests available rooms:
   ```xml
   <iq type='get' id='getUserRooms'>
     <query xmlns='http://jabber.org/protocol/disco#items'/>
   </iq>
   ```
2. Server responds with room list:
   ```xml
   <iq type='result' id='getUserRooms'>
     <query xmlns='http://jabber.org/protocol/disco#items'>
       <item jid='roomid@conference.xmpp.ethoradev.com' 
             name='Room Name'
             users_cnt='5'
             room_background='url'
             room_thumbnail='url'/>
     </query>
   </iq>
   ```
3. For each room:
   ```xml
   <!-- Client sends presence to join -->
   <presence 
     from='user@xmpp.ethoradev.com'
     to='roomJID/username'
     id='presenceInRoom'>
     <x xmlns='http://jabber.org/protocol/muc'/>
   </presence>

   <!-- Server confirms membership -->
   <presence 
     from='roomJID/username'
     to='user@xmpp.ethoradev.com'>
     <x xmlns='http://jabber.org/protocol/muc#user'>
       <item affiliation='member' role='participant'/>
     </x>
   </presence>
   ```

### 2.2 Room Presence
Server responds with:
```xml
<!-- Room roster (member list) -->
<iq type='result' id='roomMemberInfo'>
  <query xmlns='ns:room:last'>
    <activity name='User Name' 
             role='owner' 
             ban_status='clear' 
             last_active='1731677817' 
             jid='user@xmpp.ethoradev.com'/>
  </query>
</iq>

<!-- Room configuration -->
<iq type='result' id='roomInfo'>
  <query xmlns='http://jabber.org/protocol/muc#owner'>
    <x xmlns='jabber:x:data' type='form'>
      <field var='muc#roomconfig_roomname'/>
      <field var='muc#roomconfig_roomdesc'/>
    </x>
  </query>
</iq>
```

## 3. Message Flow

### 3.1 Sending Messages
1. Regular text message:
   ```xml
   <message type='groupchat' to='roomJID' id='unique-id'>
     <body>message text</body>
     <store xmlns='urn:xmpp:hints'/>
   </message>
   ```

2. Media message:
   ```typescript
   // 1. Client uploads media to storage
   const mediaData = new FormData();
   mediaData.append('files', file);
   const response = await uploadFile(mediaData);

   // 2. Sends message with media URL and metadata
   const mediaMessage = xml(
     'message',
     {
       id: id,
       type: 'groupchat',
       from: client.jid.toString(),
       to: roomJID,
     },
     xml('body', {}, 'media'),
     xml('store', { xmlns: 'urn:xmpp:hints' }),
     xml('data', {
       location: response.location,
       mimetype: response.mimetype,
       size: response.size,
       fileName: response.filename,
       // ... other metadata
     })
   );
   ```

### 3.2 Receiving Messages
1. Server broadcasts to room members:
   ```xml
   <message from='roomJID/sender' 
            to='roomJID/recipient' 
            type='groupchat'>
     <body>message text</body>
     <!-- Additional metadata -->
   </message>
   ```

2. Client processes incoming stanzas:
   ```typescript
   // Stanza handler for different types
   switch (stanza.name) {
     case 'message':
       onRealtimeMessage(stanza);
       onMessageHistory(stanza);
       handleComposing(stanza);
       break;
     case 'presence':
       onPresenceInRoom(stanza);
       break;
     case 'iq':
       onGetChatRooms(stanza);
       onGetMembers(stanza);
       break;
   }
   ```

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

### 6.2 Room Management Operations
1. Create rooms:
   ```typescript
   // Create new room
   async function createRoom(title: string, description: string) {
     const roomId = `${sha256(title + Date.now())}@conference.domain`;
     
     // 1. Create room with presence
     await createRoomPresence(roomId);
     
     // 2. Set creator as owner
     await setMeAsOwner(roomId);
     
     // 3. Configure room
     await roomConfig(roomId, title, description);
   }
   ```

2. Modify room settings:
   ```xml
   <iq to='roomJID' type='set'>
     <query xmlns='http://jabber.org/protocol/muc#owner'>
       <x xmlns='jabber:x:data' type='submit'>
         <field var='muc#roomconfig_roomname'>
           <value>New Room Name</value>
         </field>
         <field var='muc#roomconfig_roomdesc'>
           <value>New Description</value>
         </field>
       </x>
     </query>
   </iq>
   ```

3. Invite users:
   ```xml
   <message to='roomJID'>
     <x xmlns='http://jabber.org/protocol/muc#user'>
       <invite to='user@domain'>
         <reason>Please join our room</reason>
       </invite>
     </x>
   </message>
   ```

4. Member roles:
   - Owner: Full control over room
   - Admin: Can moderate users and messages
   - Member: Regular participant
   - None: No special privileges
   - Banned: Blocked from room

   Role changes are managed through IQ stanzas:
   ```xml
   <iq to='roomJID' type='set'>
     <query xmlns='http://jabber.org/protocol/muc#admin'>
       <item affiliation='admin' jid='user@domain'/>
     </query>
   </iq>
   ```