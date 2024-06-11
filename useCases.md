# Ethora chat component:

##To test it locally

1.  npm i
2.  npm start

##Variants of usage:

1. If You just start the app as it is it will show up as full page 1 room.<br />
2. if You want to add it to Your existent app:<br />
   a. Install all dependencies<br />
   b. Import store from roomStore<br />
   c. Import ChatRoom from MainComponents<br />

```
   Default user and default room:
   const defaultUser = {
      _id: string,
      walletAddress: string,
      xmppPassword: string,
      firstName: string,
      lastName: string,
   };
```

```
   const defRoom = {
      name: string,
      users_cnt: string,
      room_background: string,
      room_thumbnail: string,
      jid: string,
      id: string,
      title: string,
      usersCnt: number,
      messages: array[],
};
```

Code should look like:
```
   <Provider store={store}>
      <ChatRoom
        key={currentRoom.jid}
        defaultRoom={currentRoom}
        isLoading={isLoading}
        defaultUser={{ ...props, _id: props.walletAddress }}
      />
   </Provider>
```

d. Add defaultUser, defaultRoom. Update logic to change user and room on your side
c. Enjoy
