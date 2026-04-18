import React, { useEffect, useState, useRef } from 'react';
import './VoiceChatUI.css';
import { StreamPixelVoiceChat } from 'streampixelsdk';
import EmojiPicker from 'emoji-picker-react';
import {  FaPaperPlane,FaWindowClose } from 'react-icons/fa';
import { Modal ,Card,Row,Col,Badge } from 'react-bootstrap';
//import { isMobile,isTablet } from 'react-device-detect';
import { BsArrowsExpand,BsArrowsCollapse,BsMicFill,BsMicMuteFill} from "react-icons/bs";






function isMobilePhone() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /android|iphone|blackberry|iemobile|opera mini/i.test(ua)
    && !/ipad|ipod/i.test(ua);
}

let isMobile = isMobilePhone();

export default function VoiceChatUI({ roomName,micStart,roomConnect,roomDisconnect,toggleMicChat,handleRoomConnect,handleMessageNumber, userName, voiceChat,textChat,darkMode,position,avatar,showAudioGroup, showChatUiMobile, onClose,onCloseChatUi  }) {



  const [sdk, setSdk] = useState(null);
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState({ localParticipant: '', remoteParticipants: [] });
  const [input, setInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMessageBox, setShowMessageBox] = useState(false);
  const [muteAll, setMuteAll] = useState(false);
  const [localUserName, setLocalUserName] = useState();
  const [newMessage, setNewMessage] = useState(0);
  const [previousMessageLength,setPreviousMessageLength] = useState(0);

  const [mutedParticipants, setMutedParticipants] = useState({});
  const [localMic,setLocalMic] = useState(micStart);
  const inputRef = useRef(null);




const styleChatBox = isMobile
  ? {
      position: "absolute",
      zIndex: 1,
    
    }
  : {
      
    };

  const scrollRef = useRef();


  useEffect(() => {

    if(sdk === null && roomConnect === true){


    const chatSdk = new StreamPixelVoiceChat(roomName, userName, voiceChat,avatar,micStart);
    setSdk(chatSdk);
    setLocalUserName(userName);

console.log("USERNAME:",userName);
    const setup = async () => {
      chatSdk.onMessage((msg) => {
        const time = new Date();
        setMessages(prev => [...prev, { ...msg, time }]);
        scrollToBottom();
      });



    chatSdk.onParticipantUpdate((list) => {
    setParticipants(list);

    if (muteAll) {
        const muteMap = {};
        list.remoteParticipants.forEach(p => {
            muteMap[p.id] = true;  
        });
        setMutedParticipants(muteMap);
    }

    });

      await chatSdk.join();

      handleRoomConnect(true);

    };

    setup();
  }
    return () => {
    
    };
  }, [roomName, userName]);




  
    useEffect(() => {
    if (input.trim() === '' && document.activeElement === inputRef.current) {
      inputRef.current.blur();
    }
  }, [input]);

    useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement === inputRef.current &&  e.key !== 'Enter') {
       e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true); 

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  const sendMessage = () => {
    if (input.trim()) {
      sdk && sdk.sendMessage(input.trim());
      setShowMessageBox(true);
      setInput('');
      inputRef.current.blur();

      const videoElement =  document.getElementById('videoElement');

      videoElement.focus();
    }
  };



useEffect(() => {
  const disconnectRoom = async () => {

    if (roomDisconnect) {

      try {
        await sdk.leave();
       setSdk(null);
      } catch (error) {
        console.error("Error:", error);
      }
    }
  };

  disconnectRoom();
}, [roomDisconnect]);



useEffect(() => {

  if(sdk !== null){
      toggleMic(participants.localParticipant.id)
  }
}, [toggleMicChat]);
    


  const muteAllRemote = async () => {
    sdk.muteAllRemote();
    const updated = {};
    participants.remoteParticipants.forEach(p => {
      updated[p.id] = true;
    });
    setMutedParticipants(updated);
    setMuteAll(true);
  };

  const unmuteAllRemote = () => {
    sdk.unmuteAllRemote();
    const updated = {};
    participants.remoteParticipants.forEach(p => {
      updated[p.id] = false;
    });
    setMutedParticipants(updated);
    setMuteAll(false);
  };

  const muteSelected = async (identity) => {

    sdk.muteSelected(identity);
    setMutedParticipants(prev => ({ ...prev, [identity]: true }));
  };

  const unmuteSelected = async (identity) => {

    sdk.unmuteSelected(identity);
    setMutedParticipants(prev => ({ ...prev, [identity]: false }));
  };

  const toggleMic = (participantId) => {
    if (participantId === localUserName) {
      sdk.toggleMic();
      setLocalMic(!localMic);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const onEmojiClick = (emojiData) => {
    setInput(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

// const chunkArray = (array, size) => {
//   const chunkedArr = [];
//   for (let i = 0; i < array.length; i += size) {
//     chunkedArr.push(array.slice(i, i + size));
//   }
//   return chunkedArr;
// };


useEffect(() => {
  if (scrollRef.current) {
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }

  const lastMessage = messages[messages.length-1];

  if(lastMessage&&lastMessage.from !== "You" && messages.length > previousMessageLength){


    setPreviousMessageLength(messages.length);

  if(showMessageBox  === false && !isMobile){
    setNewMessage(newMessage+1);
    handleMessageNumber(newMessage+1);
  }
  if(showChatUiMobile  === false && isMobile){
     setNewMessage(newMessage+1);
     handleMessageNumber(newMessage+1);
  }


}

    if(showMessageBox  === true && !isMobile){
    setNewMessage(0);
    handleMessageNumber(0);
  }
  

    if(showChatUiMobile  === true && isMobile){
     setNewMessage(0);
     handleMessageNumber(0);

}


 }, [messages,showMessageBox,showChatUiMobile]);


  return (

    <>




    {textChat && showChatUiMobile &&(
<div
  className={`chat-container-wrapper ${darkMode ? 'dark-mode' : ''} ${
    !isMobile ? (position === 'Left' ? 'Left' : 'Right') : ''
  }`}
>    <div className="chat-container" style={styleChatBox}>
      
{isMobile &&(
     <button
      style={{
        float: 'left',
        background: 'transparent',
        border: 'none',
        fontSize: '14px',
        zIndex:1,
        cursor: 'pointer',
        marginTop:"10px",
        position:'absolute',
        left:'12px',
        color: darkMode ? '#fff' : '#333',
      }}
       onClick={onCloseChatUi}
    >
      <FaWindowClose  size={20}/>
    </button>
)}

        <div className="text-tab">
          
          <div  className={`${showMessageBox === true ? 'messages' : 'messagesHideBackground'}`}  ref={scrollRef} >
            <div style={showMessageBox || isMobile?{display:"contents"}:{display:"none"}}>
        {[...messages]
  .sort((a, b) => new Date(b.time) - new Date(a.time))
  .map((msg, index) => (
        
      <div key={index} className={`message-wrapper ${msg.from === 'You' ? 'right' : 'left'}`}>
  <div className={`sender-name ${msg.from === 'You' ? 'right' : 'left'}`}>{msg.from === 'You' ?'':msg.from }</div>

  <div className={`message-box ${msg.from === 'You' ? 'local' : 'remote'}`}>
   

    <div className="message-content">
      <div className="message-text">{msg.text}</div>
      <div className="timestamp">
      
           {new Date(msg.time).toLocaleTimeString(navigator.language, {hour: '2-digit', minute:'2-digit'})} 
        
      </div>
    </div>
  </div>
</div>


            ))}
        
          </div>     </div>


          <div className="input-container">
  {showEmojiPicker && <EmojiPicker onEmojiClick={onEmojiClick} />}
  <div className="input-wrapper">
    {/*
    <button className="emoji-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
      <FaSmile />
    </button>
    */}
    <input
      ref={inputRef}
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && sendMessage()}
      placeholder="Type a message"
    />

    {isMobile && (

    <button className="send-btn" onClick={sendMessage}>
      <FaPaperPlane color='#fff' size={20}/>
    </button>
    )}

     {!isMobile && (
<div className="button-wrapper">
  <button className="send-btn" onClick={() => setShowMessageBox(!showMessageBox)}>
    {showMessageBox ? <BsArrowsCollapse color='white'/> : <BsArrowsExpand color='white'/>}
  </button>

  {newMessage > 0 && (
    <Badge bg="danger" className="notification-badge">
      {newMessage}
    </Badge>
  )}
</div>
     )}

      {voiceChat &&  !isMobile && (

       <button className="send-btn" onClick={() => toggleMic(participants.localParticipant.id)}>
                 {localMic ? <BsMicFill color='white' size={20}/>:<BsMicMuteFill color='white' size={20}/>}
      </button>
      )
    }

  </div>
</div>
        </div>
</div>


</div>
    )}


<Modal

  show={showAudioGroup}
  onHide={() => onClose()}
  size="lg"
  aria-labelledby="contained-modal-title-vcenter"
  centered

  
>
  
  <div className="modal-content" style={{
    background:darkMode?'rgba(0,0,0,0.4)':'rgba(255,255,255,0.08)'
  }}>
  <Modal.Body style={{ border: 'none', borderRadius: '20px', opacity: '0.95' }}>
    <Card style={{ border: 'none', background: 'transparent', padding: '1rem' }}>
      
      <Row className="justify-content-center mb-3">
        <Col xs={12}>
          <h5 style={{ color:"#fff",textAlign: 'center', marginBottom: '0' }}>Audio Groups</h5>
        </Col>
      </Row>

      <Row className="mb-4">
        <Col xs={12}>
          <p style={{ textAlign: 'justify', marginBottom: '0',color:"#fff" }}>
            Audio group allows you to selectively mute participants in the same space,
            enabling you to hear only the users you want to listen to. When you mute
            someone in the audio group, it silences their audio from your end, but they
            can still hear your voice.
          </p>
        </Col>
      </Row>

      <div style={{ height: '200px', overflowY: 'auto', overflowX: 'hidden' }}>
        <Row>
          {participants.remoteParticipants.map((item, index) => (
            <Col
              className='audiogroup'
              key={index}
              xs={12}
              sm={6}
              md={4}
              lg={4}
              xl={4}
              style={{
                margin: '1%',
                display: 'flex',
                alignItems: 'center',
                height: '60px',
                borderColor: 'transparent',
                backdropFilter: 'blur(10px)',
                borderRadius: '8px',
                backgroundColor: '#f9f9f9cc',
                gap: '1px',
                padding: '12px',
          
              }}
            >
              <div style={{ width: '40px', height: '32px', flexShrink: 0 }}>
                {item.avatar && item.avatar.includes('<svg') ? (
                  <div
                    className="avatar img"
                    style={{ width: '100%', height: '100%' }}
                    dangerouslySetInnerHTML={{
                      __html: item.avatar.replace(/\}$/, '')
                    }}
                  />
                ) : (
                  <div
                    className="avatar img"
                    style={{ width: '100%', height: '100%' }}
                  >
                    <img
                      src={item.avatar && item.avatar.replace(/\}$/, '')}
                      alt="avatar"
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%'
                      }}
                    />
                  </div>
                )}
              </div>

              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px'
                }}
              >
                <p style={{ margin: 0, fontSize: '13px', flex: 1 }}>
                  {item.id.split('&')[0]}
                </p>
                {item.speaking && (
                  <div
                    style={{
                      width: '10px',
                      height: '10px',
                      backgroundColor: 'green',
                      borderRadius: '50%'
                    }}
                  />
                )}
              </div>

              <div style={{ flexShrink: 0 }}>
                <button
                  style={{
                    width: '28px',
                    height: '28px',
                    border: 'none',
                    backgroundColor: 'rgba(255,255,255,0.3)',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onClick={() =>
                    mutedParticipants[item.id]
                      ? unmuteSelected(item.id)
                      : muteSelected(item.id)
                  }
                >
                  {mutedParticipants[item.id] ? (
                    <BsMicMuteFill  size={20}/>
                  ) : (
                    <BsMicFill  size={20}/>
                  )}
                </button>
              </div>
            </Col>
          ))}
        </Row>
      </div>

      <br />
      <br />
      <Row className="justify-content-center text-center">
        <Col xs="auto">
          {muteAll ? (
            <button
              style={{
                padding: '12px 48px 12px 48px',
                borderColor: 'transparent',
                borderRadius: '6px',
                background: '#007aff',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onClick={unmuteAllRemote}
            >
              Unmute All
            </button>
          ) : (
            <button
              style={{
                padding: '12px 48px 12px 48px',
                borderColor: 'transparent',
                borderRadius: '6px',
                background: '#007aff',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onClick={muteAllRemote}
            >
              Mute All
            </button>
          )}
        </Col>
      </Row>
    </Card>
  </Modal.Body>
  </div>
</Modal>




    </>
  );
}


// const styles = {
//   button: {
//     backgroundColor: 'rgba(0, 0, 0, 0.5)',
//     border: 'none',
//     padding: '10px',
//     borderRadius: '5px',
//     color: 'white',
//     cursor: 'pointer',
//   },
// };