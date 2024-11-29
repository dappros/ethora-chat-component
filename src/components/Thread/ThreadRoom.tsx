// import React from 'react';

// const ThreadRoom = () => {
//   return (
//     <ChatContainer
//       style={{
//         overflow: 'auto',
//         ...config?.chatRoomStyles,
//       }}
//     >
//       {!config?.disableHeader && (
//         <ChatHeader currentRoom={roomsList[activeRoomJID]} />
//       )}
//       {loading || globalLoading ? (
//         <Loader color={config?.colors?.primary} />
//       ) : roomsList[activeRoomJID]?.messages &&
//         roomsList[activeRoomJID]?.messages.length < 1 ? (
//         <div
//           style={{
//             height: '100%',
//             display: 'flex',
//             justifyContent: 'center',
//             alignItems: 'center',
//           }}
//         >
//           <NoMessagesPlaceholder />
//         </div>
//       ) : (
//         <MessageList
//           loadMoreMessages={loadMoreMessages}
//           CustomMessage={CustomMessageComponent}
//           user={user}
//           roomJID={activeRoomJID}
//           config={config}
//           loading={isLoadingMore}
//         />
//       )}
//       <SendInput
//         sendMessage={sendMessage}
//         sendMedia={sendMedia}
//         config={config}
//         onFocus={sendStartComposing}
//         onBlur={sendEndComposing}
//         isLoading={loading}
//       />
//     </ChatContainer>
//   );
// };

// export default ThreadRoom;
