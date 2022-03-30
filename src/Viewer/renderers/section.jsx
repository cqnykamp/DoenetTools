import React, { useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faLevelDownAlt, faTimes, faCloud, faPercentage } from '@fortawesome/free-solid-svg-icons'
import { faCaretRight as twirlIsClosed } from '@fortawesome/free-solid-svg-icons';
import { faCaretDown as twirlIsOpen } from '@fortawesome/free-solid-svg-icons';

import useDoenetRender from './useDoenetRenderer';

export default function Section(props) {
  let {name, SVs, children, actions, callAction} = useDoenetRender(props);
  // console.log("name: ", name, " SVs: ", SVs," Children",children);

  if (SVs.hidden){
    return null;
  }

  let validationState = useRef(null);

  const updateValidationState = () => {
    validationState.current = 'unvalidated';
    if (SVs.justSubmitted) {
      if (SVs.creditAchieved === 1) {
        validationState.current = 'correct';
      } else if (SVs.creditAchieved === 0) {
        validationState.current = 'incorrect';
      } else {
        validationState.current = 'partialcorrect';
      }
    }
  };

  let submitAllAnswers = () => callAction({
    action: actions.submitAllAnswers
  })

  let title;
  // BADBADBAD: need to redo how getting the title child
  // getting it using the internal guts of componentInstructions
  // is just asking for trouble
  if (SVs.titleChildName) {
    for (let [ind, child] of children.entries()) {
      //child might be a string
      if (child.props?.componentInstructions.componentName === SVs.titleChildName) {
        title = children[ind];
        children.splice(ind, 1); // remove title
        break;
      }
    }
    
  }

  if(!title) {
    title = SVs.title;
  }
  
  let heading = null;
  let headingId = name + "_title";

  if (SVs.collapsible) {
    if (SVs.open) {
      title = <><FontAwesomeIcon icon={twirlIsOpen} /> {title} (click to close)</>
    } else {
      title = <><FontAwesomeIcon icon={twirlIsClosed} /> {title} (click to open)</>
    }
  }


  if (SVs.level === 0) {
    heading = <h1 id={headingId} style={{fontSize:'2em'}}>{title}</h1>;
  } else if (SVs.level === 1) {
    heading = <h2 id={headingId} style={{fontSize:'1.5em'}}>{title}</h2>;
  } else if (SVs.level === 2) {
    heading = <h3 id={headingId} style={{fontSize:'1.17em'}}>{title}</h3>;
  } else if (SVs.level === 3) {
    heading = <h4 id={headingId} style={{fontSize:'1em'}}>{title}</h4>;
  } else if (SVs.level === 4) {
    heading = <h5 id={headingId} style={{fontSize:'.83em'}}>{title}</h5>;
  } else if (SVs.level === 5) {
    heading = <h6 id={headingId} style={{fontSize:'.67em'}}>{title}</h6>;
  }

  let checkworkComponent = null;

  if (SVs.createSubmitAllButton) {
  
    updateValidationState();

  
    let checkWorkStyle = {
      height: "23px",
      display: "inline-block",
      backgroundColor: "rgb(2, 117, 216)",
      padding: "1px 6px 1px 6px",
      color: "white",
      fontWeight: "bold",
      marginBottom: "30px",  //Space after check work
    }

    let checkWorkText = "Check Work";
    if (!SVs.showCorrectness) {
      checkWorkText = "Submit Response";
    }
    checkworkComponent = (
      <button id={name + "_submit"}
        tabIndex="0"
        style={checkWorkStyle}
        onClick={submitAllAnswers}
        onKeyPress={(e) => {
          if (e.key === 'Enter') {
            submitAllAnswers();
          }
        }}
      >
        <FontAwesomeIcon icon={faLevelDownAlt} transform={{ rotate: 90 }} />
    &nbsp;
        {checkWorkText}
      </button>);

    if (SVs.showCorrectness) {
      if (validationState.current === "correct") {
        checkWorkStyle.backgroundColor = "rgb(92, 184, 92)";
        checkworkComponent = (
          <span id={name + "_correct"}
            style={checkWorkStyle}
          >
            <FontAwesomeIcon icon={faCheck} />
        &nbsp;
        Correct
          </span>);
      } else if (validationState.current === "incorrect") {
        checkWorkStyle.backgroundColor = "rgb(187, 0, 0)";
        checkworkComponent = (
          <span id={name + "_incorrect"}
            style={checkWorkStyle}
          >
            <FontAwesomeIcon icon={faTimes} />
        &nbsp;
        Incorrect
          </span>);
      } else if (validationState.current === "partialcorrect") {
        checkWorkStyle.backgroundColor = "#efab34";
        let percent = Math.round(SVs.creditAchieved * 100);
        let partialCreditContents = `${percent}% Correct`;

        checkworkComponent = (
          <span id={name + "_partial"}
            style={checkWorkStyle}
          >
            {partialCreditContents}
          </span>);
      }
    } else {
      // showCorrectness is false
      if (validationState.current !== "unvalidated") {
        checkWorkStyle.backgroundColor = "rgb(74, 3, 217)";
        checkworkComponent = (
          <span id={name + "_saved"}
            style={checkWorkStyle}
          >
            <FontAwesomeIcon icon={faCloud} />
        &nbsp;
        Response Saved
          </span>);
      }
    }

    checkworkComponent = <div>{checkworkComponent}</div>
  }


  let content = <>
        <a name={name} />
        {heading}
        {children}
        {checkworkComponent}
      </>;

  if (SVs.collapsible) {
    if (SVs.open) {
      if (SVs.boxed){

        content = <>
        <a name={name} />
       
        <span style={{
          display: "block",
          // margin: "4px 4px 0px 4px",
          // padding: "6px",
          // border: "1px solid #C9C9C9",
          backgroundColor: "#ebebeb",
          cursor: "pointer"
        }}
          onClick={() => callAction({action: actions.closeSection})}>
          <a name={name} />
          {heading}
        </span>
        <span style={{
          display: "block",
          // margin: "0px 4px 4px 4px",
          padding: "6px",
          // paddingTop: "10px",
          border: "1px solid #C9C9C9",
          backgroundColor: "white",
        }}>
         
          {children}
          {checkworkComponent}
        </span>
  
      </>
      }else{
        content = <>
        <a name={name} />
        <span style={{
          display: "block",
          // margin: "4px 4px 0px 4px",
          // padding: "6px",
          // border: "1px solid #C9C9C9",
          backgroundColor: "#ebebeb",
          cursor: "pointer"
        }}
          onClick={() => callAction({action: actions.closeSection})}>
          <a name={name} />
          {heading}
        </span>
        <span style={{
          display: "block",
          // margin: "0px 4px 4px 4px",
          // padding: "6px",
          // border: "1px solid #C9C9C9",
          backgroundColor: "white",
          // backgroundColor: "#c41e1e",
        }}>
          {children}
          {checkworkComponent}
        </span>
      </>
      }
     
    } else {
      content = <>
        <a name={name} />
        <span style={{
          display: "block",
          // margin: "4px 4px 0px 4px",
          // padding: "6px",
          // border: "1px solid #C9C9C9",
          backgroundColor: "#ebebeb",
          cursor: "pointer"
        }}
          onClick={() => callAction({action: actions.revealSection})}>
          {heading}
        </span>
      </>

    }
  } else if (SVs.boxed) {
    content = <>
    <span style={{
      display: "block",
      margin: "4px 4px 0px 4px",
      padding: "6px",
      border: "1px solid #C9C9C9",
      backgroundColor: "#ebebeb",
    }}
     >
      <a name={name} />
      {heading}
    </span>
    <span style={{
      display: "block",
      margin: "0px 4px 4px 4px",
      padding: "6px",
      border: "1px solid #C9C9C9",
      backgroundColor: "white",
    }}>
      {children}
      {checkworkComponent}
    </span>
    </>
  } 


  if (SVs.containerTag === "aside") {
    return <aside id={name} >
      {content}
    </aside>
  } else if (SVs.containerTag === "div") {
    return <div id={name} >
      {content}
    </div>
  } else if (SVs.containerTag === "none") {
    return <>
      {content}
    </>
  } else {
    // return <section id={name} style={{pageBreakAfter: "always"}} >
    return <section id={name} >
      {content}
    </section>
  }

}

// // export default class Section extends DoenetRenderer {
//   export  class Section_old extends DoenetRenderer {

//   render() {

//     if (this.doenetSvData.hidden) {
//       return null;
//     }

//     let heading = null;

//     let id = this.componentName + "_title";

//     let childrenToRender = [...this.children];

//     // BADBADBAD: need to redo how getting the title child
//     // getting it using the internal guts of componentInstructions
//     // is just asking for trouble

//     let title;
//     if (this.doenetSvData.titleChildName) {
//       let titleChildInd;
//       for (let [ind, child] of this.children.entries()) {
//         if (child.props.componentInstructions.componentName === this.doenetSvData.titleChildName) {
//           titleChildInd = ind;
//           break;
//         }
//       }
//       title = this.children[titleChildInd];
//       childrenToRender.splice(titleChildInd, 1); // remove title
//     } else {
//       title = this.doenetSvData.title;
//     }

//     if (this.doenetSvData.collapsible) {
//       if (this.doenetSvData.open) {
//         title = <><FontAwesomeIcon icon={twirlIsOpen} /> {title} (click to close)</>
//       } else {
//         title = <><FontAwesomeIcon icon={twirlIsClosed} /> {title} (click to open)</>
//       }
//     }

//     if (this.doenetSvData.level === 0) {
//       heading = <h1 id={id} style={{fontSize:'2em'}}>{title}</h1>;
//     } else if (this.doenetSvData.level === 1) {
//       heading = <h2 id={id} style={{fontSize:'1.5em'}}>{title}</h2>;
//     } else if (this.doenetSvData.level === 2) {
//       heading = <h3 id={id} style={{fontSize:'1.17em'}}>{title}</h3>;
//     } else if (this.doenetSvData.level === 3) {
//       heading = <h4 id={id} style={{fontSize:'1em'}}>{title}</h4>;
//     } else if (this.doenetSvData.level === 4) {
//       heading = <h5 id={id} style={{fontSize:'.83em'}}>{title}</h5>;
//     } else if (this.doenetSvData.level === 5) {
//       heading = <h6 id={id} style={{fontSize:'.67em'}}>{title}</h6>;
//     }

//     //  if (this.doenetSvData.level === 0) {
//     //   heading = <span style={{fontSize:"30px"}} id={id}>{title}</span>;
//     // } else if (this.doenetSvData.level === 1) {
//     //   heading = <span style={{fontSize:"26px"}} id={id}>{title}</span>;
//     // } else if (this.doenetSvData.level === 2) {
//     //   heading = <span style={{fontSize:"22px"}} id={id}>{title}</span>;
//     // } else if (this.doenetSvData.level === 3) {
//     //   heading = <span style={{fontSize:"18px"}} id={id}>{title}</span>;
//     // } else if (this.doenetSvData.level === 4) {
//     //   heading = <span style={{fontSize:"14px"}} id={id}>{title}</span>;
//     // } else if (this.doenetSvData.level === 5) {
//     //   heading = <span style={{fontSize:"12px"}} id={id}>{title}</span>;
//     // }

//     let checkworkComponent = null;

//     if (this.doenetSvData.createSubmitAllButton) {

//       let validationState = "unvalidated";
//       if (this.doenetSvData.justSubmitted) {
//         if (this.doenetSvData.creditAchieved === 1) {
//           validationState = "correct";
//         } else if (this.doenetSvData.creditAchieved === 0) {
//           validationState = "incorrect";
//         } else {
//           validationState = "partialcorrect";
//         }
//       }

//       let checkWorkStyle = {
//         height: "23px",
//         display: "inline-block",
//         backgroundColor: "rgb(2, 117, 216)",
//         padding: "1px 6px 1px 6px",
//         color: "white",
//         fontWeight: "bold",
//         marginBottom: "30px",  //Space after check work
//       }

//       let checkWorkText = "Check Work";
//       if (!this.doenetSvData.showCorrectness) {
//         checkWorkText = "Submit nse";
//       }
//       checkworkComponent = (
//         <button id={this.componentName + "_submit"}
//           tabIndex="0"
//           style={checkWorkStyle}
//           onClick={this.actions.submitAllAnswers}
//           onKeyPress={(e) => {
//             if (e.key === 'Enter') {
//               this.actions.submitAllAnswers();
//             }
//           }}
//         >
//           <FontAwesomeIcon icon={faLevelDownAlt} transform={{ rotate: 90 }} />
//       &nbsp;
//           {checkWorkText}
//         </button>);

//       if (this.doenetSvData.showCorrectness) {
//         if (validationState === "correct") {
//           checkWorkStyle.backgroundColor = "rgb(92, 184, 92)";
//           checkworkComponent = (
//             <span id={this.componentName + "_correct"}
//               style={checkWorkStyle}
//             >
//               <FontAwesomeIcon icon={faCheck} />
//           &nbsp;
//           Correct
//             </span>);
//         } else if (validationState === "incorrect") {
//           checkWorkStyle.backgroundColor = "rgb(187, 0, 0)";
//           checkworkComponent = (
//             <span id={this.componentName + "_incorrect"}
//               style={checkWorkStyle}
//             >
//               <FontAwesomeIcon icon={faTimes} />
//           &nbsp;
//           Incorrect
//             </span>);
//         } else if (validationState === "partialcorrect") {
//           checkWorkStyle.backgroundColor = "#efab34";
//           let percent = Math.round(this.doenetSvData.creditAchieved * 100);
//           let partialCreditContents = `${percent}% Correct`;

//           checkworkComponent = (
//             <span id={this.componentName + "_partial"}
//               style={checkWorkStyle}
//             >
//               {partialCreditContents}
//             </span>);
//         }
//       } else {
//         // showCorrectness is false
//         if (validationState !== "unvalidated") {
//           checkWorkStyle.backgroundColor = "rgb(74, 3, 217)";
//           checkworkComponent = (
//             <span id={this.componentName + "_saved"}
//               style={checkWorkStyle}
//             >
//               <FontAwesomeIcon icon={faCloud} />
//           &nbsp;
//           Response Saved
//             </span>);
//         }
//       }

//       checkworkComponent = <div>{checkworkComponent}</div>
//     }

//     let content;

//     if (this.doenetSvData.collapsible) {
     

//       if (this.doenetSvData.open) {

//         if (this.doenetSvData.boxed){
//           if (this.doenetSvData.level === 0) {
//             heading = <h1 id={id} style={{fontSize:'2em',marginBottom:"0px"}}>{title}</h1>;
//           } else if (this.doenetSvData.level === 1) {
//             heading = <h2 id={id} style={{fontSize:'1.5em',marginBottom:"0px"}}>{title}</h2>;
//           } else if (this.doenetSvData.level === 2) {
//             heading = <h3 id={id} style={{fontSize:'1.17em',marginBottom:"0px"}}>{title}</h3>;
//           } else if (this.doenetSvData.level === 3) {
//             heading = <h4 id={id} style={{fontSize:'1em',marginBottom:"0px"}}>{title}</h4>;
//           } else if (this.doenetSvData.level === 4) {
//             heading = <h5 id={id} style={{fontSize:'.83em',marginBottom:"0px"}}>{title}</h5>;
//           } else if (this.doenetSvData.level === 5) {
//             heading = <h6 id={id} style={{fontSize:'.67em',marginBottom:"0px"}}>{title}</h6>;
//           }
//           content = <>
//           <a name={this.componentName} />
         
//           <span style={{
//             display: "block",
//             // margin: "4px 4px 0px 4px",
//             // padding: "6px",
//             // border: "1px solid #C9C9C9",
//             backgroundColor: "#ebebeb",
//             cursor: "pointer"
//           }}
//             onClick={this.actions.closeSection}>
//             <a name={this.componentName} />
//             {heading}
//           </span>
//           <span style={{
//             display: "block",
//             // margin: "0px 4px 4px 4px",
//             padding: "6px",
//             // paddingTop: "10px",
//             border: "1px solid #C9C9C9",
//             backgroundColor: "white",
//           }}>
           
//             {childrenToRender}
//             {checkworkComponent}
//           </span>
    
//         </>
//         }else{
//           content = <>
//           <a name={this.componentName} />
//           <span style={{
//             display: "block",
//             // margin: "4px 4px 0px 4px",
//             // padding: "6px",
//             // border: "1px solid #C9C9C9",
//             backgroundColor: "#ebebeb",
//             cursor: "pointer"
//           }}
//             onClick={this.actions.closeSection}>
//             <a name={this.componentName} />
//             {heading}
//           </span>
//           <span style={{
//             display: "block",
//             // margin: "0px 4px 4px 4px",
//             // padding: "6px",
//             // border: "1px solid #C9C9C9",
//             backgroundColor: "white",
//             // backgroundColor: "#c41e1e",
//           }}>
//             {childrenToRender}
//             {checkworkComponent}
//           </span>
//         </>
//         }
       



//       } else {
//         content = <>
//           <a name={this.componentName} />
//           <span style={{
//             display: "block",
//             // margin: "4px 4px 0px 4px",
//             // padding: "6px",
//             // border: "1px solid #C9C9C9",
//             backgroundColor: "#ebebeb",
//             cursor: "pointer"
//           }}
//             onClick={this.actions.revealSection}>
//             {heading}
//           </span>
//         </>

//       }
//     } else if (this.doenetSvData.boxed) {
//       content = <>
//       <span style={{
//         display: "block",
//         margin: "4px 4px 0px 4px",
//         padding: "6px",
//         border: "1px solid #C9C9C9",
//         backgroundColor: "#ebebeb",
//       }}
//        >
//         <a name={this.componentName} />
//         {heading}
//       </span>
//       <span style={{
//         display: "block",
//         margin: "0px 4px 4px 4px",
//         padding: "6px",
//         border: "1px solid #C9C9C9",
//         backgroundColor: "white",
//       }}>
//         {childrenToRender}
//         {checkworkComponent}
//       </span>
//       </>
//     } else {
//       content = <>
//         <a name={this.componentName} />
//         {heading}
//         {childrenToRender}
//         {checkworkComponent}
//       </>;
//     }

//     if (this.doenetSvData.containerTag === "aside") {
//       return <aside id={this.componentName} >
//         {content}
//       </aside>
//     } else if (this.doenetSvData.containerTag === "div") {
//       return <div id={this.componentName} >
//         {content}
//       </div>
//     } else if (this.doenetSvData.containerTag === "none") {
//       return <>
//         {content}
//       </>
//     } else {
//       // return <section id={this.componentName} style={{pageBreakAfter: "always"}} >
//       return <section id={this.componentName} >
//         {content}
//       </section>
//     }
//   }
// }